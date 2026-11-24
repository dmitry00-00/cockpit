#!/usr/bin/env python3
"""Build a self-contained armillary GLB and a matching transparent PNG fallback.

Uses Python's standard library only. Coordinates are normalized scene units with +Y up.
"""
from __future__ import annotations

import json
import math
import struct
import zlib
import copy
from pathlib import Path

OUT = Path(__file__).resolve().parent
LEVELS = ["cosmology", "plane", "system", "planet", "continent", "region", "settlement", "building", "battle"]
MATERIALS = [
    {"name": "Aged brass", "baseColorFactor": [0.43, 0.24, 0.075, 1], "metallicFactor": 0.78, "roughnessFactor": 0.34},
    {"name": "Dark steel", "baseColorFactor": [0.12, 0.13, 0.15, 1], "metallicFactor": 0.72, "roughnessFactor": 0.42},
    {"name": "Plum enamel", "baseColorFactor": [0.19, 0.035, 0.09, 1], "metallicFactor": 0.42, "roughnessFactor": 0.29},
]


def norm(v):
    d = math.sqrt(sum(x * x for x in v)) or 1
    return tuple(x / d for x in v)


def outward(p, n):
    for i in range(0, len(p), 3):
        p[i + 1], p[i + 2] = p[i + 2], p[i + 1]
        n[i + 1], n[i + 2] = n[i + 2], n[i + 1]
    return p, n


def torus(radius, tube, around, across):
    p, n = [], []
    for i in range(around):
        a0, a1 = math.tau * i / around, math.tau * (i + 1) / around
        for j in range(across):
            b0, b1 = math.tau * j / across, math.tau * (j + 1) / across
            for a, b in ((a0, b0), (a1, b0), (a1, b1), (a0, b0), (a1, b1), (a0, b1)):
                cb, sb, ca, sa = math.cos(b), math.sin(b), math.cos(a), math.sin(a)
                p.append(((radius + tube * cb) * ca, tube * sb, (radius + tube * cb) * sa))
                n.append(norm((cb * ca, sb, cb * sa)))
    return outward(p, n)


def sphere(radius, around, rings):
    p, n = [], []
    for i in range(rings):
        t0, t1 = math.pi * i / rings, math.pi * (i + 1) / rings
        for j in range(around):
            a0, a1 = math.tau * j / around, math.tau * (j + 1) / around
            def point(t, a):
                return (math.sin(t) * math.cos(a), math.cos(t), math.sin(t) * math.sin(a))
            for q in (point(t0, a0), point(t1, a0), point(t1, a1), point(t0, a0), point(t1, a1), point(t0, a1)):
                p.append(tuple(radius * x for x in q)); n.append(q)
    return outward(p, n)


def cylinder(radius, height, segments):
    p, n = [], []
    for i in range(segments):
        a0, a1 = math.tau * i / segments, math.tau * (i + 1) / segments
        u0, u1 = (math.cos(a0), 0, math.sin(a0)), (math.cos(a1), 0, math.sin(a1))
        b0, b1 = (radius * u0[0], 0, radius * u0[2]), (radius * u1[0], 0, radius * u1[2])
        t0, t1 = (b0[0], height, b0[2]), (b1[0], height, b1[2])
        for v, nn in ((b0, u0), (t0, u0), (t1, u1), (b0, u0), (t1, u1), (b1, u1)):
            p.append(v); n.append(nn)
        center_bottom, center_top = (0, 0, 0), (0, height, 0)
        for v, nn in ((center_bottom, (0, -1, 0)), (b1, (0, -1, 0)), (b0, (0, -1, 0)),
                      (center_top, (0, 1, 0)), (t0, (0, 1, 0)), (t1, (0, 1, 0))):
            p.append(v); n.append(nn)
        p[-5], p[-4] = p[-4], p[-5]; n[-5], n[-4] = n[-4], n[-5]
        p[-2], p[-1] = p[-1], p[-2]; n[-2], n[-1] = n[-1], n[-2]
    return p, n


def quat_euler(x, y, z):
    cx, sx = math.cos(x / 2), math.sin(x / 2)
    cy, sy = math.cos(y / 2), math.sin(y / 2)
    cz, sz = math.cos(z / 2), math.sin(z / 2)
    return (sx * cy * cz - cx * sy * sz, cx * sy * cz + sx * cy * sz,
            cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz)


def geometry(around, across):
    meshes = []
    for index, level in enumerate(LEVELS):
        radius = 0.50 + index * 0.043
        meshes.append({"name": f"scale_ring_{level}", "material": 0 if index % 3 else 1,
                       "position": [0, 0, 0], "rotation": quat_euler(math.radians((index * 29) % 95), math.radians((index * 17) % 75), math.radians((index * 23) % 110)),
                       "pivot": True, "level": level, "mesh": torus(radius, 0.009 + (index % 2) * 0.002, around, across)})
    foot = torus(0.39, 0.034, around, across)
    meshes.append({"name": "support_foot", "material": 0, "position": [0, -1.16, 0], "rotation": [0, 0, 0, 1], "mesh": foot})
    meshes.append({"name": "support_column", "material": 1, "position": [0, -1.15, 0], "rotation": [0, 0, 0, 1], "mesh": cylinder(0.027, 1.05, max(16, around // 2))})
    meshes.append({"name": "axis_cap", "material": 0, "position": [0, 0, 0], "rotation": [0, 0, 0, 1], "mesh": sphere(0.15, max(16, around // 2), max(8, across))})
    meshes[-1]["material"] = 2
    return meshes


def align4(blob):
    return blob + b"\0" * ((-len(blob)) % 4)


def write_glb(path, meshes):
    binary, views, accessors, gltf_meshes, nodes = bytearray(), [], [], [], []
    all_points = []
    triangle_count = 0
    for material_index, material in enumerate(MATERIALS):
        pass
    for mesh in meshes:
        positions, normals = mesh["mesh"]
        if not positions:
            continue
        all_points.extend(positions)
        start = len(binary)
        pos_bytes = b"".join(struct.pack("<3f", *v) for v in positions)
        binary.extend(pos_bytes); binary.extend(b"\0" * ((-len(binary)) % 4))
        pos_view = len(views); views.append({"buffer": 0, "byteOffset": start, "byteLength": len(pos_bytes), "target": 34962})
        mins = [min(v[i] for v in positions) for i in range(3)]
        maxs = [max(v[i] for v in positions) for i in range(3)]
        pos_accessor = len(accessors); accessors.append({"bufferView": pos_view, "componentType": 5126, "count": len(positions), "type": "VEC3", "min": mins, "max": maxs})
        norm_start = len(binary)
        norm_bytes = b"".join(struct.pack("<3f", *v) for v in normals)
        binary.extend(norm_bytes); binary.extend(b"\0" * ((-len(binary)) % 4))
        norm_view = len(views); views.append({"buffer": 0, "byteOffset": norm_start, "byteLength": len(norm_bytes), "target": 34962})
        norm_accessor = len(accessors); accessors.append({"bufferView": norm_view, "componentType": 5126, "count": len(normals), "type": "VEC3"})
        gltf_meshes.append({"name": mesh["name"], "primitives": [{"attributes": {"POSITION": pos_accessor, "NORMAL": norm_accessor}, "material": mesh["material"], "mode": 4}]})
        node_index = len(nodes)
        node = {"name": mesh["name"] + ("_pivot" if mesh.get("pivot") else ""), "mesh": len(gltf_meshes) - 1,
                "translation": mesh["position"], "rotation": mesh["rotation"]}
        if mesh.get("pivot"):
            node["extras"] = {"scaleLevel": mesh["level"], "pivotAxisLocal": [1, 0, 0], "pivotOrigin": [0, 0, 0], "neutralRotation": mesh["rotation"]}
        nodes.append(node)
        triangle_count += len(positions) // 3
    bbox_min = [min(v[i] for v in all_points) for i in range(3)]
    bbox_max = [max(v[i] for v in all_points) for i in range(3)]
    doc = {"asset": {"version": "2.0", "generator": "build_armillary.py"},
           "scene": 0, "scenes": [{"name": "Armillary scale instrument", "nodes": list(range(len(nodes)))}],
           "nodes": nodes, "meshes": gltf_meshes,
           "materials": [{"name": m["name"], "pbrMetallicRoughness": {k: v for k, v in m.items() if k != "name"}} for m in MATERIALS],
           "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(binary)}],
           "extras": {"coordinateSystem": "right-handed, Y-up, meters as normalized units", "triangleCount": triangle_count,
                      "bounds": {"min": bbox_min, "max": bbox_max}, "usesExternalResources": False}}
    js = align4(json.dumps(doc, separators=(",", ":")).encode("utf-8"))
    bin_chunk = align4(bytes(binary))
    total = 12 + 8 + len(js) + 8 + len(bin_chunk)
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(bin_chunk), b"BIN\0") + bin_chunk)
    return triangle_count, [round(bbox_min[i], 5) for i in range(3)], [round(bbox_max[i], 5) for i in range(3)]


def validate_glb(path, triangle_limit, byte_limit):
    data = path.read_bytes()
    magic, version, declared = struct.unpack_from("<4sII", data)
    assert magic == b"glTF" and version == 2 and declared == len(data)
    json_len, json_kind = struct.unpack_from("<I4s", data, 12)
    assert json_kind == b"JSON"
    doc = json.loads(data[20:20 + json_len].decode("utf-8").rstrip(" \t\r\n\0"))
    bin_pos = 20 + json_len
    bin_len, bin_kind = struct.unpack_from("<I4s", data, bin_pos)
    assert bin_kind == b"BIN\0" and bin_pos + 8 + bin_len == len(data)
    binary = data[bin_pos + 8:bin_pos + 8 + bin_len]
    binary_size = doc["buffers"][0]["byteLength"]
    assert binary_size <= bin_len
    assert not any("uri" in item for item in [*doc["buffers"], *doc.get("images", [])] if isinstance(item, dict))
    assert not doc.get("extensionsUsed") and not doc.get("extensionsRequired")
    for view in doc["bufferViews"]:
        assert view["buffer"] == 0 and view["byteOffset"] + view["byteLength"] <= binary_size
    triangle_count = 0
    for mesh in doc["meshes"]:
        for primitive in mesh["primitives"]:
            assert primitive["mode"] == 4
            position = doc["accessors"][primitive["attributes"]["POSITION"]]
            normal = doc["accessors"][primitive["attributes"]["NORMAL"]]
            assert position["type"] == normal["type"] == "VEC3" and position["count"] == normal["count"]
            assert position["count"] % 3 == 0
            def read_vec3(accessor):
                view = doc["bufferViews"][accessor["bufferView"]]
                start = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
                return [struct.unpack_from("<3f", binary, start + i * 12) for i in range(accessor["count"])]
            points, normals = read_vec3(position), read_vec3(normal)
            for i in range(0, len(points), 3):
                a, b, c = points[i:i + 3]
                e1, e2 = tuple(b[k] - a[k] for k in range(3)), tuple(c[k] - a[k] for k in range(3))
                face = (e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0])
                face_len = math.sqrt(sum(v * v for v in face))
                avg_normal = tuple(sum(normals[j][k] for j in (i, i + 1, i + 2)) for k in range(3))
                if face_len > 1e-10:
                    assert sum(face[k] * avg_normal[k] for k in range(3)) > 0, f"inconsistent winding at {mesh['name']} triangle {i // 3}"
            triangle_count += position["count"] // 3
    pivots = [node for node in doc["nodes"] if node.get("extras", {}).get("scaleLevel")]
    assert len(pivots) == len(LEVELS)
    assert len(doc["materials"]) <= 3 and triangle_count <= triangle_limit and len(data) <= byte_limit
    return {"validGlb2": True, "triangles": triangle_count, "bytes": len(data), "materials": len(doc["materials"]), "pivots": len(pivots), "externalUris": 0, "windingMatchesNormals": True}


def rotate(q, v):
    x, y, z, w = q
    tx, ty, tz = 2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])
    return (v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx)


def png_chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)


def render_png(path, meshes, width=512, height=512, camera=(2.5, 2.25, 4.2), spin=None, target=(0, -0.25, 0)):
    if spin:
        meshes = copy.deepcopy(meshes)
        pivot_mesh = next(m for m in meshes if m["name"] == spin["node"])
        angle = math.radians(spin["degrees"] / 2)
        extra = (math.sin(angle), 0, 0, math.cos(angle))
        x, y, z, w = pivot_mesh["rotation"]; a, b, c, d = extra
        pivot_mesh["rotation"] = [w*a+x*d+y*c-z*b, w*b-x*c+y*d+z*a, w*c+x*b-y*a+z*d, w*d-x*a-y*b-z*c]
    cam = norm(camera); forward = tuple(-x for x in cam)
    right = norm((forward[2], 0, -forward[0])); up = norm((forward[1] * right[2] - forward[2] * right[1], forward[2] * right[0] - forward[0] * right[2], forward[0] * right[1] - forward[1] * right[0]))
    light = norm((-0.45, 0.80, 0.56)); scale = min(width, height) * (0.35 if min(width, height) <= 128 else 0.37)
    zbuf = [-1e9] * (width * height)
    pixels = bytearray(width * height * 4)
    for mesh in meshes:
        positions, normals = mesh["mesh"]
        color = MATERIALS[mesh["material"]]["baseColorFactor"][:3]
        q, tr = mesh["rotation"], mesh["position"]
        for k in range(0, len(positions), 3):
            verts, ns = [], []
            for j in range(3):
                p = rotate(q, positions[k + j]); p = tuple(p[a] + tr[a] for a in range(3))
                n = norm(rotate(q, normals[k + j]))
                relative = tuple(p[a] - target[a] for a in range(3))
                proj = (width / 2 + sum(relative[a] * right[a] for a in range(3)) * scale,
                        height / 2 - sum(relative[a] * up[a] for a in range(3)) * scale,
                        sum(p[a] * cam[a] for a in range(3)))
                verts.append(proj); ns.append(n)
            (x0, y0, z0), (x1, y1, z1), (x2, y2, z2) = verts
            area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0)
            if abs(area) < 1e-6: continue
            minx, maxx = max(0, int(min(x0, x1, x2))), min(width - 1, int(max(x0, x1, x2)) + 1)
            miny, maxy = max(0, int(min(y0, y1, y2))), min(height - 1, int(max(y0, y1, y2)) + 1)
            for py in range(miny, maxy + 1):
                for px in range(minx, maxx + 1):
                    xx, yy = px + 0.5, py + 0.5
                    a = ((x1 - xx) * (y2 - yy) - (y1 - yy) * (x2 - xx)) / area
                    b = ((x2 - xx) * (y0 - yy) - (y2 - yy) * (x0 - xx)) / area
                    c = 1 - a - b
                    if min(a, b, c) < -1e-5: continue
                    depth = a * z0 + b * z1 + c * z2
                    idx = py * width + px
                    if depth <= zbuf[idx]: continue
                    zbuf[idx] = depth
                    n = norm(tuple(a * ns[0][i] + b * ns[1][i] + c * ns[2][i] for i in range(3)))
                    diffuse = max(0, sum(n[i] * light[i] for i in range(3)))
                    shade = min(1.15, 0.34 + diffuse * 0.78)
                    for channel in range(3):
                        linear = min(1, max(0, color[channel] * shade))
                        pixels[idx * 4 + channel] = round((1.055 * linear ** (1 / 2.4) - 0.055) * 255) if linear > 0.0031308 else round(linear * 12.92 * 255)
                    pixels[idx * 4 + 3] = 255
    raw = b"".join(b"\0" + pixels[y * width * 4:(y + 1) * width * 4] for y in range(height))
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) + png_chunk(b"IDAT", zlib.compress(raw, 9)) + png_chunk(b"IEND", b""))


def main():
    variants = {"main": (64, 12), "lite": (32, 8)}
    info = {"asset": "armillary-scale", "version": "codex-v1", "generator": "Python standard library procedural geometry", "unit": "normalized units (meters for scene sizing)", "upAxis": "+Y", "rightHanded": True,
            "materials": MATERIALS, "textures": [], "externalUris": [], "extensionsUsed": [], "extensionsRequired": [],
            "nodes": [], "variants": {}, "status": "technical prototype; visual approval pending"}
    for variant, (around, across) in variants.items():
        meshes = geometry(around, across)
        glb = OUT / f"armillary-{variant}-v1.glb"
        triangles, bounds_min, bounds_max = write_glb(glb, meshes)
        validation = validate_glb(glb, 20000 if variant == "main" else 8000, 3_000_000 if variant == "main" else 1_500_000)
        info["variants"][variant] = {"file": glb.name, "bytes": glb.stat().st_size, "triangles": triangles, "boundsMin": bounds_min, "boundsMax": bounds_max,
                                     "meshCount": len(meshes), "maxMaterials": len(MATERIALS), "texturedPbrMaps": 0, "validation": validation}
        if variant == "main":
            render_png(OUT / "armillary-front.png", meshes, camera=(0.0, 2.2, 8.0))
            render_png(OUT / "armillary-three-quarter.png", meshes)
            render_png(OUT / "armillary-ring-pivot-45.png", meshes, spin={"node": "scale_ring_region", "degrees": 45})
            render_png(OUT / "armillary-front-128.png", meshes, width=128, height=128, camera=(0.0, 2.2, 8.0))
            # Preserve the previous full-size fallback filename for local consumers.
            render_png(OUT / "armillary-fallback-v1.png", meshes)
            for mesh in meshes:
                if mesh.get("pivot"):
                    info["nodes"].append({"name": mesh["name"] + "_pivot", "mesh": mesh["name"], "scaleLevel": mesh["level"], "pivotAxisLocal": [1, 0, 0], "pivotOrigin": [0, 0, 0], "neutralRotation": mesh["rotation"]})
            info["previews"] = [
                {"file": "armillary-front.png", "width": 512, "height": 512, "alpha": True, "view": "front"},
                {"file": "armillary-three-quarter.png", "width": 512, "height": 512, "alpha": True, "view": "three-quarter"},
                {"file": "armillary-ring-pivot-45.png", "width": 512, "height": 512, "alpha": True, "view": "scale_ring_region +45 degrees"},
            ]
    info["fallback"] = {"file": "armillary-front-128.png", "width": 128, "height": 128, "alpha": True, "renderedFrom": "same generated geometry, software orthographic rasterizer"}
    (OUT / "model-info.json").write_text(json.dumps(info, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(info["variants"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
