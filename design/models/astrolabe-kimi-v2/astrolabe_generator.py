#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
astrolabe_generator.py v2 — процедурный генератор функциональной 3D-астролябии
для интерфейса DM Cockpit (бриф KIMI_ASTROLABE_3D_BRIEF.md + правки приёмки v1).

Изменения v2 (по «Приёмка Kimi astrolabe v1», 02.11.2026):
- мягкие фаски корпуса/ободка/диска (токарный профиль, а не простая экструзия);
- рама без «одинаковых блоков»: тонкая гравировка, бусины, 4 лепестковых мотива;
- более тонкая и изящная решётка;
- указатель отличим: латунь (светлее решётки), листовидный наконечник,
  полумесяц противовеса, костяная вставка, поднят на 2 мм над решёткой;
- лунный половинчатый кружок удалён; на раме — оправа moon_seat с тёмным ложем
  и пустым узлом moon_indicator_anchor под кодовый индикатор фазы;
- рельефная ось: воротник, бусина, купол, эмалевый кабошон.

Редактируемый исходник моделей astrolabe-main-v2.glb / astrolabe-lite-v2.glb
(.blend недоступен в среде сборки). Зависимости: numpy, trimesh, shapely,
Pillow, mapbox-earcut. Запуск: python3 astrolabe_generator.py [каталог].

Координатный контракт: фронт — XY, нормаль +Z, верх +Y; вращение деталей —
локальная Z их pivot-узлов; root в центре корпуса; метры; диаметр 0.24 м.
"""
import os, sys, json
import numpy as np
import trimesh
from trimesh.creation import extrude_polygon
from trimesh.visual.material import PBRMaterial
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union
from shapely.affinity import rotate as shp_rotate, translate as shp_translate
from PIL import Image, ImageDraw

# ------------------------------------------------------------------ параметры
Z = dict(body=(-0.006, 0.004), rim=(0.004, 0.010), cal=(0.004, 0.007),
         rete=(0.008, 0.0105), pointer=(0.0125, 0.0152), inlay=(0.0152, 0.0158))
BODY_R = 0.120
MOON_SEAT_POS = np.array([0.08, 0.08, 0.0])   # на раме, угол 45°
ECL_C = (0.0, -0.020)

# ------------------------------------------------------------- базовые утилиты
def cylinder_z(r, z0, z1, seg):
    m = trimesh.creation.cylinder(radius=r, height=z1 - z0, sections=seg)
    m.apply_translation([0, 0, (z0 + z1) / 2]); return m

def circ(x, y, r, res=48):
    return Point(x, y).buffer(r, resolution=res)

def extrude(poly, z0, z1):
    return extrude_polygon(poly, z1 - z0).apply_translation([0, 0, z0])

def lathe(profile, seg):
    """Токарная деталь вокруг оси Z.
    profile: [(r, z, zone)], zone 'cap' -> планарные UV, 'side' -> чистый угол.
    Соседние кольца разных зон дублируются (чистые UV-границы)."""
    rings = []   # (r, z, zone)
    for i, (r, z, zone) in enumerate(profile):
        if 0 < i < len(profile) - 1 and profile[i-1][2] != zone:
            pr, pz, _ = profile[i-1]
            rings.append((pr, pz, zone))          # дубликат границы зон
        rings.append((r, z, zone))
    verts, uvs = [], []
    for r, z, zone in rings:
        for k in range(seg + 1):
            a = 2 * np.pi * k / seg
            verts.append([r * np.cos(a), r * np.sin(a), z])
            if zone == 'cap':
                uvs.append([r * np.cos(a) / (2 * BODY_R) * 0.94 + 0.5,
                            r * np.sin(a) / (2 * BODY_R) * 0.94 + 0.5])
            else:
                uvs.append([0.04 + 0.02 * k / seg, 0.04 + 0.02 * (z * 100) % 0.02])
    verts = np.array(verts); uvs = np.array(uvs)
    faces = []
    W = seg + 1
    for i in range(len(rings) - 1):
        for k in range(seg):
            a, b = i * W + k, i * W + k + 1
            c, d = (i + 1) * W + k, (i + 1) * W + k + 1
            faces += [[a, c, b], [b, c, d]]
    m = trimesh.Trimesh(vertices=verts, faces=np.array(faces), process=False)
    keep = m.nondegenerate_faces()
    m.update_faces(keep)
    m.visual = trimesh.visual.TextureVisuals(uv=uvs)
    return m

def const_uv(mesh, u=0.04, v=0.04):
    """Постоянные UV в 'чистом углу' атласа (для мелких гладких деталей)."""
    mesh.visual = trimesh.visual.TextureVisuals(
        uv=np.full((len(mesh.vertices), 2), [u, v]))
    return mesh

def unshare(mesh):
    v = mesh.vertices[mesh.faces].reshape(-1, 3)
    f = np.arange(len(v)).reshape(-1, 3)
    return trimesh.Trimesh(vertices=v, faces=f, process=False)

def assign_uv(mesh, R_planar=BODY_R, planar_top=True):
    m = unshare(mesh)
    n = m.face_normals
    uv = np.full((len(m.vertices), 2), [0.04, 0.04])
    if planar_top:
        front = np.abs(n[:, 2]) > 0.7
        for fi in np.where(front)[0]:
            for vtx in m.faces[fi]:
                x, y = m.vertices[vtx, 0], m.vertices[vtx, 1]
                uv[vtx] = [x / (2 * R_planar) * 0.94 + 0.5,
                           y / (2 * R_planar) * 0.94 + 0.5]
    m.visual = trimesh.visual.TextureVisuals(uv=uv)
    return m

# ------------------------------------------------------------------ геометрия
def build_geometry(q):
    seg  = max(24, int(128 * q))
    seg2 = max(16, int(64 * q))
    g = {}
    # body — токарный профиль с фасками
    g["body"] = lathe([
        (0.0000, -0.006, 'cap'), (0.1130, -0.006, 'cap'),
        (0.1180, -0.0050, 'cap'), (0.1200, -0.0035, 'side'),
        (0.1200, 0.0020, 'side'), (0.1180, 0.0035, 'cap'),
        (0.1130, 0.004, 'cap'), (0.0000, 0.004, 'cap')], seg)
    # outer_rim — кольцо с округлым верхом + 12 заклёпок
    g["outer_rim"] = trimesh.util.concatenate([lathe([
        (0.106, 0.004, 'side'), (0.106, 0.0078, 'side'),
        (0.1070, 0.0092, 'cap'), (0.1085, 0.0100, 'cap'),
        (0.1175, 0.0100, 'cap'), (0.1190, 0.0092, 'cap'),
        (0.1200, 0.0078, 'side'), (0.1200, 0.004, 'side'),
        (0.106, 0.004, 'side')], seg)] + [
        const_uv(trimesh.creation.uv_sphere(0.0020, count=[max(6, int(10*q)), max(4, int(8*q))])
            .apply_translation([0.113*np.cos(i*np.pi/6), 0.113*np.sin(i*np.pi/6), 0.0102]))
        for i in range(12)])
    # calendar_disc — костяная пластина с фаской
    g["calendar_disc"] = lathe([
        (0.0000, 0.004, 'cap'), (0.1040, 0.004, 'cap'),
        (0.1040, 0.0055, 'side'), (0.1020, 0.007, 'cap'),
        (0.0000, 0.007, 'cap')], seg)
    # rete — тонкая ажурная решётка
    def spoke(angle_deg, w=0.0022, r0=0.011, r1=0.096):
        return shp_rotate(box(-w/2, r0, w/2, r1), angle_deg, origin=(0, 0))
    def flame(x, y, ang, L, w=0.0038):
        tri = Polygon([(0, -w), (L, 0), (0, w), (L*0.35, 0)])
        return shp_translate(shp_rotate(tri, ang, origin=(0, 0)), x, y)
    outer_band = circ(0, 0, 0.100, seg2).difference(circ(0, 0, 0.0955, seg2))
    ecliptic   = circ(*ECL_C, 0.0585, seg2).difference(circ(*ECL_C, 0.0555, seg2))
    hub        = circ(0, 0, 0.0145, seg2//2).difference(circ(0, 0, 0.012, seg2//2))
    hub_fill   = circ(0, 0, 0.012, seg2//2)
    spokes     = unary_union([spoke(a) for a in (0, 90, 180, 270, 45, 135, 225, 315)])
    flames = []
    for i, deg in enumerate(range(0, 360, 30)):
        a = np.deg2rad(deg)
        px = ECL_C[0] + 0.057*np.cos(a); py = ECL_C[1] + 0.057*np.sin(a)
        flames.append(flame(px, py, np.degrees(np.arctan2(py, px)),
                            L=0.011 if i % 3 else 0.0145))
        flames.append(circ(px, py, 0.0028, 8))
    rete_poly = unary_union([outer_band, ecliptic, hub, hub_fill, spokes] + flames)
    rete_poly = rete_poly.intersection(circ(0, 0, 0.100, seg2))
    g["rete"] = extrude(rete_poly, *Z["rete"])
    # time_pointer — латунь: листовидный наконечник + полумесяц + ступица
    blade = Polygon([(-0.030, 0.0030), (0.075, 0.0030), (0.086, 0.0080),
                     (0.104, 0.0), (0.086, -0.0080), (0.075, -0.0030), (-0.030, -0.0030)])
    tail = box(-0.090, -0.0025, -0.028, 0.0025)
    crescent = circ(-0.084, 0, 0.0085, 24).difference(circ(-0.080, 0, 0.0075, 24))
    g["time_pointer"] = extrude(unary_union(
        [blade, tail, crescent, circ(0, 0, 0.014, seg2//2)]), *Z["pointer"])
    # time_pointer_inlay — костяная вставка вдоль клинка
    inlay = Polygon([(-0.020, 0.0012), (0.070, 0.0012), (0.074, 0.0),
                     (0.070, -0.0012), (-0.020, -0.0012)])
    g["time_pointer_inlay"] = extrude(inlay, *Z["inlay"])
    # center_cap — воротник, бусина, купол
    collar = const_uv(cylinder_z(0.009, Z["rete"][1], 0.0135, seg2))
    waist  = const_uv(cylinder_z(0.007, 0.0135, 0.0155, seg2))
    bead   = const_uv(trimesh.creation.torus(0.0075, 0.0012, major_sections=seg2,
                                    minor_sections=max(8, int(12*q))))
    bead.apply_translation([0, 0, 0.0155])
    dome   = const_uv(trimesh.creation.uv_sphere(0.0055, count=[seg2//2, max(8, seg2//4)]))
    dome.apply_translation([0, 0, 0.0158])
    g["center_cap"] = trimesh.util.concatenate([collar, waist, bead, dome])
    # enamel_inlay — сливовый кабошон на вершине оси
    en = trimesh.creation.uv_sphere(0.0032, count=[seg2//2, max(8, seg2//4)])
    en.apply_translation([0, 0, 0.0188])
    g["enamel_inlay"] = en
    # suspension_ring — «трон» + кольцо
    throne = Polygon([(-0.013, 0.107), (0.013, 0.107), (0.0075, 0.132), (-0.0075, 0.132)])
    throne_m = const_uv(extrude(throne, -0.002, 0.006))
    ring_t = const_uv(trimesh.creation.torus(0.016, 0.0026, major_sections=seg2,
                                    minor_sections=max(8, int(14*q))))
    ring_t.apply_translation([0, 0.132 + 0.016, 0.002])
    g["suspension_ring"] = trimesh.util.concatenate([throne_m, ring_t])
    # moon_seat — оправа на раме (45°) + тёмное ложе под кодовую фазу
    bez = lathe([
        (0.0072, 0.0104, 'cap'), (0.0072, 0.0119, 'side'),
        (0.0076, 0.0125, 'cap'), (0.0085, 0.0127, 'cap'),
        (0.0092, 0.0124, 'cap'), (0.0095, 0.0118, 'side'),
        (0.0095, 0.0095, 'side'), (0.0072, 0.0095, 'cap'),
        (0.0072, 0.0104, 'cap')], seg2)
    bez.apply_translation(MOON_SEAT_POS)
    g["moon_seat"] = bez
    floor = cylinder_z(0.0072, 0.0098, 0.0104, seg2)
    floor.apply_translation(MOON_SEAT_POS)
    g["moon_seat_floor"] = floor
    return g

# -------------------------------------------------------------------- текстуры
def fbm_noise(shape, octaves=5, seed=7):
    rng = np.random.default_rng(seed)
    acc = np.zeros(shape); amp, total, size = 1.0, 0.0, 4
    for _ in range(octaves):
        small = rng.random((size, size))
        img = np.asarray(Image.fromarray((small*255).astype(np.uint8))
                         .resize(shape[::-1], Image.BICUBIC), dtype=float) / 255
        acc += amp * img; total += amp; amp *= 0.55; size *= 2
    return acc / total

def _ring(d, cxy, r_px, w, val):
    d.ellipse([cxy[0]-r_px-w, cxy[1]-r_px-w, cxy[0]+r_px+w, cxy[1]+r_px+w],
              outline=val, width=w)

def painter_brass(db, dh, dr, cx, cy, pxm):
    """Рама: тонкие кольца, приглушённые короткие штрихи, бусины, 4 лепестка.
    Без делений-«блоков». Полированные (тёмные в roughness) линии бликов."""
    soft = (96, 74, 44)
    for r, w in [(0.1085, 1), (0.1170, 1)]:
        _ring(dh, (cx, cy), r*pxm, w, 0.22); _ring(db, (cx, cy), r*pxm, w, soft)
        _ring(dr, (cx, cy), r*pxm, w, 0.30)   # полированная линия = управляемый блик
    for i in range(48):                        # приглушённые короткие штрихи
        a = i * np.pi / 24
        p0 = (cx + 0.1095*pxm*np.cos(a), cy + 0.1095*pxm*np.sin(a))
        p1 = (cx + 0.1112*pxm*np.cos(a), cy + 0.1112*pxm*np.sin(a))
        dh.line([p0, p1], fill=0.18, width=1); db.line([p0, p1], fill=(110, 88, 56), width=1)
    for i in range(12):                        # бусины между заклёпками
        a = i * np.pi / 6 + np.pi / 12
        x, y = cx + 0.1131*pxm*np.cos(a), cy + 0.1131*pxm*np.sin(a)
        rpx = max(2, int(0.0011 * pxm))
        dh.ellipse([x-rpx, y-rpx, x+rpx, y+rpx], outline=0.35, width=2)
        db.ellipse([x-rpx, y-rpx, x+rpx, y+rpx], outline=soft, width=2)
    for i in range(4):                         # лепестковый мотив по диагоналям
        a = np.pi / 4 + i * np.pi / 2
        bx, by = 0.1131*np.cos(a), 0.1131*np.sin(a)
        for k in (-1, 0, 1):
            aa = a + k * 0.055
            x, y = cx + (0.1131 + 0.0012*abs(k))*pxm*np.cos(aa), \
                   cy + (0.1131 + 0.0012*abs(k))*pxm*np.sin(aa)
            rpx = max(2, int((0.0013 if k == 0 else 0.0009) * pxm))
            dh.ellipse([x-rpx, y-rpx, x+rpx, y+rpx], outline=0.30, width=2)
            db.ellipse([x-rpx, y-rpx, x+rpx, y+rpx], outline=(86, 64, 36), width=2)
    for r, w in [(0.035, 2), (0.065, 2), (0.092, 2), (0.102, 3)]:   # тыл
        _ring(dh, (cx, cy), r*pxm, w, 0.3); _ring(db, (cx, cy), r*pxm, w, (76, 56, 32))

def painter_bone(db, dh, dr, cx, cy, pxm):
    dark = (120, 105, 80)
    for r, w in [(0.020, 1), (0.040, 1), (0.060, 1), (0.080, 2), (0.098, 2)]:
        _ring(dh, (cx, cy), r*pxm, w, 0.2); _ring(db, (cx, cy), r*pxm, w, dark)
        _ring(dr, (cx, cy), r*pxm, w, 0.75)
    for i in range(60):
        a = i * np.pi / 30
        r0 = 0.088 if i % 5 else 0.084
        p0 = (cx + r0*pxm*np.cos(a), cy + r0*pxm*np.sin(a))
        p1 = (cx + 0.096*pxm*np.cos(a), cy + 0.096*pxm*np.sin(a))
        dh.line([p0, p1], fill=0.2, width=1); db.line([p0, p1], fill=dark, width=1)

def painter_bronze(db, dh, dr, cx, cy, pxm):
    dark = (50, 35, 20)
    for i in range(1, 10):
        _ring(dh, (cx, cy), i*0.010*pxm, 1, 0.15); _ring(db, (cx, cy), i*0.010*pxm, 1, dark)
    for i in range(24):
        a = i * np.pi / 12
        p0 = (cx + 0.01*pxm*np.cos(a), cy + 0.01*pxm*np.sin(a))
        p1 = (cx + 0.10*pxm*np.cos(a), cy + 0.10*pxm*np.sin(a))
        dh.line([p0, p1], fill=0.12, width=1)

def make_maps(size, painter, name, base_rgb, rough0, metal0, outdir, jpg_q=90):
    """BaseColor(sRGB, JPG) / Normal(OpenGL Y+, PNG) /
    ORM: R=AO=1, G=roughness, B=metallic (JPG, metallicRoughnessTexture)."""
    noise = fbm_noise((size, size), seed=abs(hash(name)) % 1000)
    noise2 = fbm_noise((size, size), seed=abs(hash(name)) % 1000 + 5)
    patina = fbm_noise((size, size), seed=abs(hash(name)) % 1000 + 11)
    base = np.zeros((size, size, 3))
    for c in range(3):
        base[..., c] = base_rgb[c] * (0.86 + 0.28*noise) - 28*noise2
    pm = np.clip((patina - 0.55) * 2, 0, 1)[..., None]      # пятна патины
    base = base * (1 - 0.35*pm) + np.array([96, 104, 66]) * (0.35*pm)
    pxm = size / (0.24 / 0.94)
    img_b = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
    img_h = Image.fromarray(np.full((size, size), 0.5, dtype=np.float32))
    img_r = Image.fromarray(np.full((size, size), rough0, dtype=np.float32))
    painter(ImageDraw.Draw(img_b), ImageDraw.Draw(img_h), ImageDraw.Draw(img_r),
            size/2, size/2, pxm)
    base = np.asarray(img_b).astype(float)
    h = np.asarray(img_h) * 2 - 1
    rough = np.clip(np.asarray(img_r) + 0.14*(noise-0.5) + 0.25*pm[..., 0], 0.05, 1)
    gy, gx = np.gradient(h)
    nrm = np.stack([-gx*1.6, gy*1.6, np.ones_like(h)], -1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    normal = ((nrm*0.5 + 0.5) * 255).astype(np.uint8)
    orm = np.zeros((size, size, 3), np.uint8)
    orm[..., 0] = 255; orm[..., 1] = (rough*255).astype(np.uint8)
    orm[..., 2] = int(metal0 * 255)
    Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)) \
        .save(f"{outdir}/textures/{name}_basecolor.jpg", quality=jpg_q)
    Image.fromarray(normal).save(f"{outdir}/textures/{name}_normal.png")
    Image.fromarray(orm).save(f"{outdir}/textures/{name}_orm.jpg", quality=jpg_q)

# ------------------------------------------------------------ материалы/сцена
def build_materials(outdir):
    L = lambda p: Image.open(p)
    return dict(
        brass=PBRMaterial(name="brass_aged",
            baseColorTexture=L(f"{outdir}/textures/brass_aged_basecolor.jpg"),
            metallicRoughnessTexture=L(f"{outdir}/textures/brass_aged_orm.jpg"),
            normalTexture=L(f"{outdir}/textures/brass_aged_normal.png"),
            metallicFactor=1.0, roughnessFactor=1.0),
        bone=PBRMaterial(name="bone_plate",
            baseColorTexture=L(f"{outdir}/textures/bone_plate_basecolor.jpg"),
            metallicRoughnessTexture=L(f"{outdir}/textures/bone_plate_orm.jpg"),
            normalTexture=L(f"{outdir}/textures/bone_plate_normal.png"),
            metallicFactor=1.0, roughnessFactor=1.0),
        bronze=PBRMaterial(name="bronze_rete",
            baseColorTexture=L(f"{outdir}/textures/bronze_rete_basecolor.jpg"),
            metallicRoughnessTexture=L(f"{outdir}/textures/bronze_rete_orm.jpg"),
            normalTexture=L(f"{outdir}/textures/bronze_rete_normal.png"),
            metallicFactor=1.0, roughnessFactor=1.0),
        plum=PBRMaterial(name="plum_enamel", baseColorFactor=[46, 21, 36, 255],
            metallicFactor=0.0, roughnessFactor=0.24))

def with_mat(mesh, mat, planar):
    if not isinstance(mesh.visual, trimesh.visual.TextureVisuals) \
            and mat.name != "plum_enamel":
        mesh = assign_uv(mesh, planar_top=planar)
    mesh.visual.material = mat
    return mesh

def assemble(geoms, mats, path):
    """astrolabe_root
    ├─ body, outer_rim, suspension_ring
    ├─ moon_seat → moon_seat_floor ; moon_indicator_anchor (пустой, кодовая фаза)
    ├─ calendar_disc_pivot → calendar_disc
    ├─ rete_pivot → rete
    ├─ time_pointer_pivot → time_pointer → time_pointer_inlay
    └─ center_cap → center_cap_geom → enamel_inlay"""
    sc = trimesh.Scene(); I4 = np.eye(4)
    def Tm(xyz):
        m = np.eye(4); m[:3, 3] = xyz; return m
    sc.graph.update(frame_from=sc.graph.base_frame, frame_to="astrolabe_root", matrix=I4)
    for n in ["calendar_disc_pivot", "rete_pivot", "time_pointer_pivot"]:
        sc.graph.update(frame_from="astrolabe_root", frame_to=n, matrix=I4)
    sc.graph.update(frame_from="astrolabe_root", frame_to="moon_seat", matrix=I4)
    sc.graph.update(frame_from="moon_seat", frame_to="moon_seat_floor_node", matrix=I4)
    sc.graph.update(frame_from="astrolabe_root", frame_to="moon_indicator_anchor",
                    matrix=Tm([0.08, 0.08, 0.0104]))
    sc.graph.update(frame_from="time_pointer_pivot", frame_to="time_pointer", matrix=I4)
    sc.graph.update(frame_from="time_pointer", frame_to="time_pointer_inlay_node", matrix=I4)
    sc.graph.update(frame_from="astrolabe_root", frame_to="center_cap", matrix=I4)
    sc.graph.update(frame_from="center_cap", frame_to="enamel_node", matrix=I4)
    layout = [
        ("body", "body", "astrolabe_root"), ("outer_rim", "outer_rim", "astrolabe_root"),
        ("calendar_disc", "calendar_disc", "calendar_disc_pivot"),
        ("rete", "rete", "rete_pivot"),
        ("time_pointer", "time_pointer_geom", "time_pointer"),
        ("time_pointer_inlay", "time_pointer_inlay", "time_pointer_inlay_node"),
        ("center_cap", "center_cap_geom", "center_cap"),
        ("enamel_inlay", "enamel_inlay", "enamel_node"),
        ("suspension_ring", "suspension_ring", "astrolabe_root"),
        ("moon_seat", "moon_seat_geom", "moon_seat"),
        ("moon_seat_floor", "moon_seat_floor", "moon_seat_floor_node")]
    matmap = {"body": "brass", "outer_rim": "brass", "calendar_disc": "bone",
              "rete": "bronze", "time_pointer": "brass", "time_pointer_inlay": "bone",
              "center_cap": "brass", "enamel_inlay": "plum",
              "suspension_ring": "brass", "moon_seat": "brass", "moon_seat_floor": "plum"}
    for gname, node, parent in layout:
        m = with_mat(geoms[gname].copy(), mats[matmap[gname]], True)
        sc.add_geometry(m, node_name=node, geom_name=gname,
                        parent_node_name=parent, transform=I4)
    data = sc.export(file_type="glb")
    with open(path, "wb") as f:
        f.write(data)
    return len(data)

# ----------------------------------------------------------------------- main
def main(outdir):
    os.makedirs(f"{outdir}/textures", exist_ok=True)
    make_maps(1024, painter_brass, "brass_aged", (152, 116, 68), 0.46, 0.88, outdir)
    make_maps(1024, painter_bone, "bone_plate", (208, 192, 156), 0.58, 0.0, outdir)
    make_maps(1024, painter_bronze, "bronze_rete", (112, 80, 46), 0.50, 0.88, outdir)
    mats = build_materials(outdir)
    g_main = build_geometry(1.0)
    size_main = assemble(g_main, mats, f"{outdir}/astrolabe-main-v2.glb")
    g_lite = build_geometry(0.35)
    size_lite = assemble(g_lite, mats, f"{outdir}/astrolabe-lite-v2.glb")
    tri = lambda g: sum(len(m.faces) for m in g.values())
    print(json.dumps({
        "main": {"file": "astrolabe-main-v2.glb", "bytes": size_main, "triangles": tri(g_main)},
        "lite": {"file": "astrolabe-lite-v2.glb", "bytes": size_lite, "triangles": tri(g_lite)}},
        ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__)))
