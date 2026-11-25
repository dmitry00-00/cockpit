#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
astrolabe_generator.py — процедурный генератор функциональной 3D-астролябии
для интерфейса DM Cockpit (задание KIMI_ASTROLABE_3D_BRIEF.md).

Редактируемый исходник моделей astrolabe-main-v1.glb / astrolabe-lite-v1.glb.
Blender в среде сборки недоступен, поэтому исходник — данный скрипт
(геометрия, UV, текстуры, материалы, дерево узлов описаны кодом).

Зависимости: numpy, trimesh, shapely, Pillow, mapbox-earcut (движок триангуляции).
Запуск:  python3 astrolabe_generator.py [каталог_результата]
По умолчанию результат пишется рядом со скриптом.

Координатный контракт:
  фронт прибора — плоскость XY, лицевая нормаль +Z, верх +Y;
  диски/указатель вращаются вокруг локальной Z своих pivot-узлов;
  root в центре корпуса; единицы — метры; диаметр корпуса 0.24 м.
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

# ---------------------------------------------------------------- параметры
Z = dict(body=(-0.006, 0.004), rim=(0.004, 0.010), cal=(0.004, 0.007),
         rete=(0.008, 0.0105), pointer=(0.0115, 0.014), moon=(0.0145, 0.0165))
MOON_POS = np.array([0.062, 0.062, 0.0])   # pivot диска луны (смещён от оси)
ECL_C = (0.0, -0.020)                       # эксцентричный круг решётки
BODY_R = 0.120                              # диаметр 0.24 м

# ------------------------------------------------------- геометрические утилиты
def cylinder_z(r, z0, z1, seg):
    m = trimesh.creation.cylinder(radius=r, height=z1 - z0, sections=seg)
    m.apply_translation([0, 0, (z0 + z1) / 2]); return m

def ring_z(r_out, r_in, z0, z1, seg):
    poly = Point(0, 0).buffer(r_out, resolution=max(2, seg // 4)).difference(
           Point(0, 0).buffer(r_in, resolution=max(2, seg // 4)))
    return extrude_polygon(poly, z1 - z0).apply_translation([0, 0, z0])

def extrude(poly, z0, z1):
    return extrude_polygon(poly, z1 - z0).apply_translation([0, 0, z0])

def circ(x, y, r, res=48):
    return Point(x, y).buffer(r, resolution=res)

def unshare(mesh):
    """Разделить вершины по граням: позволяет давать граням разные UV-зоны."""
    v = mesh.vertices[mesh.faces].reshape(-1, 3)
    f = np.arange(len(v)).reshape(-1, 3)
    return trimesh.Trimesh(vertices=v, faces=f, process=False)

def assign_uv(mesh, R_planar=BODY_R, planar_top=True):
    """Лицевые/тыльные грани -> планарная карта (центр текстуры);
    боковые -> 'чистый угол' [0.01..0.07]^2 вне зоны гравировки."""
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

# ------------------------------------------------------------- детали (geometry)
def build_geometry(q):
    """q — масштаб детализации (1.0 = main, ~0.4 = lite)."""
    seg  = max(24, int(128 * q))
    seg2 = max(16, int(64 * q))
    g = {}
    # body — корпус с завершённой обратной стороной
    g["body"] = cylinder_z(BODY_R, *Z["body"], seg)
    # outer_rim — неподвижная рамка + 12 заклёпок
    rim = ring_z(0.120, 0.106, *Z["rim"], seg)
    riv = []
    for i in range(12):
        a = i * np.pi / 6
        rv = trimesh.creation.uv_sphere(0.0022, count=[max(6, int(10*q)), max(4, int(8*q))])
        rv.apply_translation([0.113*np.cos(a), 0.113*np.sin(a), Z["rim"][1]])
        riv.append(rv)
    g["outer_rim"] = trimesh.util.concatenate([rim] + riv)
    # calendar_disc — сменная костяная пластина
    g["calendar_disc"] = cylinder_z(0.104, *Z["cal"], seg)
    # rete — ажурная решётка: внешнее кольцо, эксцентричная эклиптика, 8 спиц,
    # 12 «пламенных» указателей звёзд; отверстия открыты насквозь
    def spoke(angle_deg, w=0.0035, r0=0.010, r1=0.095):
        return shp_rotate(box(-w/2, r0, w/2, r1), angle_deg, origin=(0, 0))
    def flame(x, y, ang, L, w=0.005):
        tri = Polygon([(0, -w), (L, 0), (0, w), (L*0.35, 0)])
        return shp_translate(shp_rotate(tri, ang, origin=(0, 0)), x, y)
    outer_band = circ(0, 0, 0.100, seg2).difference(circ(0, 0, 0.094, seg2))
    ecliptic   = circ(*ECL_C, 0.060, seg2).difference(circ(*ECL_C, 0.054, seg2))
    hub        = circ(0, 0, 0.012, seg2 // 2)
    spokes     = unary_union([spoke(a) for a in (0, 90, 180, 270, 45, 135, 225, 315)])
    flames = []
    for i, deg in enumerate(range(0, 360, 30)):
        a = np.deg2rad(deg)
        px = ECL_C[0] + 0.057*np.cos(a); py = ECL_C[1] + 0.057*np.sin(a)
        flames.append(flame(px, py, np.degrees(np.arctan2(py, px)),
                            L=0.013 if i % 3 else 0.017))
        flames.append(circ(px, py, 0.0035, 8))
    rete_poly = unary_union([outer_band, ecliptic, hub, spokes] + flames)
    rete_poly = rete_poly.intersection(circ(0, 0, 0.100, seg2))
    g["rete"] = extrude(rete_poly, *Z["rete"])
    # time_pointer — асимметричный: копьё + ромбовидный противовес + ступица
    w = 0.007
    blade   = Polygon([(-0.030, -w/2), (0.082, -w/2), (0.104, 0), (0.082, w/2), (-0.030, w/2)])
    tail    = Polygon([(-0.030, -w*0.4), (-0.088, -w*0.4), (-0.088, w*0.4), (-0.030, w*0.4)])
    diamond = Polygon([(-0.098, 0), (-0.088, 0.007), (-0.078, 0), (-0.088, -0.007)])
    g["time_pointer"] = extrude(unary_union([blade, tail, diamond, circ(0, 0, 0.014, seg2//2)]),
                                *Z["pointer"])
    # center_cap — ось: ступица + конус (не сращён с вращаемыми деталями)
    cap1 = cylinder_z(0.0085, Z["rete"][1], 0.0155, seg2)
    cap2 = trimesh.creation.cone(0.0085, 0.003, sections=seg2)
    cap2.apply_translation([0, 0, 0.0155 + 0.0015])
    g["center_cap"] = trimesh.util.concatenate([cap1, cap2])
    # enamel_inlay — сливовый кабошон на оси (единственный акцент эмали)
    g["enamel_inlay"] = cylinder_z(0.0045, 0.017, 0.0182, seg2 // 2)
    # suspension_ring — «трон» + кольцо в плоскости XY
    throne = Polygon([(-0.014, 0.108), (0.014, 0.108), (0.008, 0.132), (-0.008, 0.132)])
    throne_m = extrude(throne, -0.002, 0.006)
    ring_t = trimesh.creation.torus(0.016, 0.0028,
                                    major_sections=seg2, minor_sections=max(8, int(16*q)))
    ring_t.apply_translation([0, 0.132 + 0.016, 0.002])
    g["suspension_ring"] = trimesh.util.concatenate([throne_m, ring_t])
    # moon_disc — половина «кость», половина «слива»; геометрия в своём pivot
    half_l = circ(0, 0, 0.013, seg2//2).intersection(box(-0.013, 0, 0.013, 0.013))
    half_d = circ(0, 0, 0.013, seg2//2).intersection(box(-0.013, -0.013, 0.013, 0))
    g["moon_disc_light"] = extrude(half_l, *Z["moon"])
    g["moon_disc_dark"]  = extrude(half_d, *Z["moon"])
    return g

# ------------------------------------------------------------------- текстуры
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
    """Ободок: кольца и 24 нейтральных деления; тыл: концентрические шкалы."""
    dark = (68, 50, 28)
    for r, w in [(0.109, 2), (0.1175, 2)]:
        _ring(dh, (cx, cy), r*pxm, w, 0.25); _ring(db, (cx, cy), r*pxm, w, dark)
        _ring(dr, (cx, cy), r*pxm, w, 0.8)
    for i in range(24):
        a = i * np.pi / 12
        p0 = (cx + 0.1075*pxm*np.cos(a), cy + 0.1075*pxm*np.sin(a))
        p1 = (cx + 0.1190*pxm*np.cos(a), cy + 0.1190*pxm*np.sin(a))
        dh.line([p0, p1], fill=0.25, width=2); db.line([p0, p1], fill=dark, width=2)
        dr.line([p0, p1], fill=0.8, width=2)
    for r, w in [(0.035, 2), (0.065, 2), (0.092, 2), (0.102, 3)]:
        _ring(dh, (cx, cy), r*pxm, w, 0.3); _ring(db, (cx, cy), r*pxm, w, (76, 56, 32))
    for i in range(48):
        a = i * np.pi / 24
        p0 = (cx + 0.096*pxm*np.cos(a), cy + 0.096*pxm*np.sin(a))
        p1 = (cx + 0.104*pxm*np.cos(a), cy + 0.104*pxm*np.sin(a))
        dh.line([p0, p1], fill=0.3, width=2); db.line([p0, p1], fill=(76, 56, 32), width=2)

def painter_bone(db, dh, dr, cx, cy, pxm):
    """Костяная пластина: кольца и 60 нейтральных делений (без цифр и знаков)."""
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
    """Каналы: BaseColor(sRGB, JPG); Normal(OpenGL Y+, PNG);
    ORM: R=AO(=1), G=roughness, B=metallic (JPG, используется как
    metallicRoughnessTexture по glTF 2.0)."""
    noise = fbm_noise((size, size), seed=abs(hash(name)) % 1000)
    noise2 = fbm_noise((size, size), seed=abs(hash(name)) % 1000 + 5)
    base = np.zeros((size, size, 3))
    for c in range(3):
        base[..., c] = base_rgb[c] * (0.88 + 0.24*noise) - 25*noise2
    pxm = size / (0.24 / 0.94)
    img_b = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
    img_h = Image.fromarray(np.full((size, size), 0.5, dtype=np.float32))
    img_r = Image.fromarray(np.full((size, size), rough0, dtype=np.float32))
    painter(ImageDraw.Draw(img_b), ImageDraw.Draw(img_h), ImageDraw.Draw(img_r),
            size/2, size/2, pxm)
    base = np.asarray(img_b).astype(float)
    h = np.asarray(img_h) * 2 - 1
    rough = np.clip(np.asarray(img_r) + 0.12*(noise-0.5), 0.05, 1)
    gy, gx = np.gradient(h)
    nrm = np.stack([-gx*1.6, gy*1.6, np.ones_like(h)], -1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    normal = ((nrm*0.5 + 0.5) * 255).astype(np.uint8)
    orm = np.zeros((size, size, 3), np.uint8)
    orm[..., 0] = 255; orm[..., 1] = (rough*255).astype(np.uint8)
    orm[..., 2] = int(metal0 * 255)
    im_base = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
    im_norm = Image.fromarray(normal)
    im_orm = Image.fromarray(orm)
    im_base.save(f"{outdir}/textures/{name}_basecolor.jpg", quality=jpg_q)
    im_norm.save(f"{outdir}/textures/{name}_normal.png")
    im_orm.save(f"{outdir}/textures/{name}_orm.jpg", quality=jpg_q)

# --------------------------------------------------------------- материалы/сцена
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
        plum=PBRMaterial(name="plum_enamel", baseColorFactor=[58, 26, 44, 255],
            metallicFactor=0.0, roughnessFactor=0.16))

def with_mat(mesh, mat, planar):
    if isinstance(mesh.visual, trimesh.visual.TextureVisuals) or mat.name != "plum_enamel":
        mesh = assign_uv(mesh, planar_top=planar)
    mesh.visual.material = mat
    return mesh

def assemble(geoms, mats, path):
    """Дерево узлов (имена стабильны, проверяются приёмкой):
    astrolabe_root
    ├─ body, outer_rim, suspension_ring
    ├─ calendar_disc_pivot → calendar_disc
    ├─ rete_pivot → rete
    ├─ time_pointer_pivot → time_pointer
    ├─ moon_disc_pivot → moon_disc → moon_disc_geom(+light), moon_disc_dark
    └─ center_cap → center_cap_geom, enamel_inlay"""
    sc = trimesh.Scene(); I4 = np.eye(4)
    def Tm(xyz):
        m = np.eye(4); m[:3, 3] = xyz; return m
    sc.graph.update(frame_from=sc.graph.base_frame, frame_to="astrolabe_root", matrix=I4)
    for n in ["calendar_disc_pivot", "rete_pivot", "time_pointer_pivot"]:
        sc.graph.update(frame_from="astrolabe_root", frame_to=n, matrix=I4)
    sc.graph.update(frame_from="astrolabe_root", frame_to="moon_disc_pivot", matrix=Tm(MOON_POS))
    sc.graph.update(frame_from="moon_disc_pivot", frame_to="moon_disc", matrix=I4)
    sc.graph.update(frame_from="moon_disc", frame_to="moon_disc_dark_node", matrix=I4)
    sc.graph.update(frame_from="astrolabe_root", frame_to="center_cap", matrix=I4)
    sc.graph.update(frame_from="center_cap", frame_to="enamel_node", matrix=I4)
    layout = [
        ("body", "body", "astrolabe_root"), ("outer_rim", "outer_rim", "astrolabe_root"),
        ("calendar_disc", "calendar_disc", "calendar_disc_pivot"),
        ("rete", "rete", "rete_pivot"),
        ("time_pointer", "time_pointer", "time_pointer_pivot"),
        ("center_cap", "center_cap_geom", "center_cap"),
        ("enamel_inlay", "enamel_inlay", "enamel_node"),
        ("suspension_ring", "suspension_ring", "astrolabe_root"),
        ("moon_disc_light", "moon_disc_geom", "moon_disc"),
        ("moon_disc_dark", "moon_disc_dark", "moon_disc_dark_node")]
    matmap = {"body": "brass", "outer_rim": "brass", "calendar_disc": "bone",
              "rete": "bronze", "time_pointer": "bronze", "center_cap": "brass",
              "enamel_inlay": "plum", "suspension_ring": "brass",
              "moon_disc_light": "bone", "moon_disc_dark": "plum"}
    planar = {"moon_disc_light": False, "moon_disc_dark": False, "enamel_inlay": False}
    for gname, node, parent in layout:
        m = with_mat(geoms[gname].copy(), mats[matmap[gname]], planar.get(gname, True))
        sc.add_geometry(m, node_name=node, geom_name=gname,
                        parent_node_name=parent, transform=I4)
    data = sc.export(file_type="glb")
    with open(path, "wb") as f:
        f.write(data)
    return len(data)

# ---------------------------------------------------------------------- main
def main(outdir):
    os.makedirs(f"{outdir}/textures", exist_ok=True)
    make_maps(1024, painter_brass, "brass_aged", (152, 116, 68), 0.46, 0.88, outdir)
    make_maps(1024, painter_bone, "bone_plate", (226, 211, 178), 0.58, 0.0, outdir)
    make_maps(1024, painter_bronze, "bronze_rete", (112, 80, 46), 0.50, 0.88, outdir)
    mats = build_materials(outdir)
    g_main = build_geometry(1.0)
    size_main = assemble(g_main, mats, f"{outdir}/astrolabe-main-v1.glb")
    g_lite = build_geometry(0.35)
    size_lite = assemble(g_lite, mats, f"{outdir}/astrolabe-lite-v1.glb")
    tri = lambda g: sum(len(m.faces) for m in g.values())
    print(json.dumps({
        "main": {"file": "astrolabe-main-v1.glb", "bytes": size_main, "triangles": tri(g_main)},
        "lite": {"file": "astrolabe-lite-v1.glb", "bytes": size_lite, "triangles": tri(g_lite)}},
        ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__)))
