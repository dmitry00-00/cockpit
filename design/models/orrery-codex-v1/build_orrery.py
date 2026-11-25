#!/usr/bin/env python3
"""Build a self-contained, procedural orrery GLB set and matching transparent previews.

Uses only the Python standard library. Coordinates are normalized scene units, +Y up.
The model is a neutral authored interface prop; it contains no campaign values or rules.
"""
from __future__ import annotations

import json
import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent
MATERIALS = [
    {"name": "Aged brass", "baseColorFactor": [0.49, 0.29, 0.105, 1], "metallicFactor": 0.76, "roughnessFactor": 0.38},
    {"name": "Dark steel", "baseColorFactor": [0.12, 0.14, 0.16, 1], "metallicFactor": 0.72, "roughnessFactor": 0.43},
    {"name": "Warm ivory", "baseColorFactor": [0.68, 0.58, 0.40, 1], "metallicFactor": 0.12, "roughnessFactor": 0.58},
]


def norm(v):
    d = math.sqrt(sum(x * x for x in v)) or 1
    return tuple(x / d for x in v)


def quat_euler(x, y, z):
    cx, sx = math.cos(x / 2), math.sin(x / 2)
    cy, sy = math.cos(y / 2), math.sin(y / 2)
    cz, sz = math.cos(z / 2), math.sin(z / 2)
    return (sx * cy * cz - cx * sy * sz, cx * sy * cz + sx * cy * sz,
            cx * cy * sz - sx * sy * cz, cx * cy * cz + sx * sy * sz)


def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return (aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw,
            aw * bw - ax * bx - ay * by - az * bz)


def qrotate(q, v):
    x, y, z, w = q
    tx, ty, tz = 2 * (y * v[2] - z * v[1]), 2 * (z * v[0] - x * v[2]), 2 * (x * v[1] - y * v[0])
    return (v[0] + w * tx + y * tz - z * ty,
            v[1] + w * ty + z * tx - x * tz,
            v[2] + w * tz + x * ty - y * tx)


def torus(radius, tube, around, across):
    p, n = [], []
    for i in range(around):
        a0, a1 = math.tau * i / around, math.tau * (i + 1) / around
        for j in range(across):
            b0, b1 = math.tau * j / across, math.tau * (j + 1) / across
            for a, b in ((a0, b0), (a1, b1), (a1, b0), (a0, b0), (a0, b1), (a1, b1)):
                cb, sb, ca, sa = math.cos(b), math.sin(b), math.cos(a), math.sin(a)
                p.append(((radius + tube * cb) * ca, tube * sb, (radius + tube * cb) * sa))
                n.append(norm((cb * ca, sb, cb * sa)))
    return p, n


def sphere(radius, around, rings):
    p, n = [], []
    for i in range(rings):
        t0, t1 = math.pi * i / rings, math.pi * (i + 1) / rings
        for j in range(around):
            a0, a1 = math.tau * j / around, math.tau * (j + 1) / around
            def point(t, a):
                return (math.sin(t) * math.cos(a), math.cos(t), math.sin(t) * math.sin(a))
            for v in (point(t0, a0), point(t1, a1), point(t1, a0), point(t0, a0), point(t0, a1), point(t1, a1)):
                p.append(tuple(radius * x for x in v)); n.append(v)
    return p, n


def cylinder(radius, height, segments):
    p, n = [], []
    for i in range(segments):
        a0, a1 = math.tau * i / segments, math.tau * (i + 1) / segments
        u0, u1 = (math.cos(a0), 0, math.sin(a0)), (math.cos(a1), 0, math.sin(a1))
        b0, b1 = (radius * u0[0], 0, radius * u0[2]), (radius * u1[0], 0, radius * u1[2])
        t0, t1 = (b0[0], height, b0[2]), (b1[0], height, b1[2])
        for v, nn in ((b0, u0), (t0, u0), (t1, u1), (b0, u0), (t1, u1), (b1, u1)):
            p.append(v); n.append(nn)
        for v, nn in (((0, 0, 0), (0, -1, 0)), (b0, (0, -1, 0)), (b1, (0, -1, 0)),
                      ((0, height, 0), (0, 1, 0)), (t1, (0, 1, 0)), (t0, (0, 1, 0))):
            p.append(v); n.append(nn)
    return p, n


def mesh(name, geometry, material):
    positions, normals = geometry
    return {"name": name, "positions": positions, "normals": normals, "material": material}


def scene(around=64, across=8, sphere_around=24, sphere_rings=14, cylinder_segments=48):
    meshes = [
        mesh("central_sun", sphere(0.135, sphere_around, sphere_rings), 2),
        mesh("orbit_inner_track", torus(0.31, 0.009, around, across), 0),
        mesh("orbit_middle_track", torus(0.53, 0.010, around, across), 1),
        mesh("orbit_outer_track", torus(0.75, 0.011, around, across), 0),
        mesh("body_inner", sphere(0.067, sphere_around, sphere_rings), 0),
        mesh("body_middle", sphere(0.085, sphere_around, sphere_rings), 2),
        mesh("body_outer", sphere(0.105, sphere_around, sphere_rings), 1),
        mesh("foot_ring", torus(0.31, 0.027, around, across), 0),
        mesh("support_column", cylinder(0.025, 0.63, cylinder_segments), 1),
        mesh("top_collar", torus(0.065, 0.018, max(24, around // 2), across), 0),
        mesh("base_pedestal", cylinder(0.27, 0.075, cylinder_segments), 0),
        mesh("base_inset", torus(0.21, 0.008, around, across), 1),
    ]
    by_name = {m["name"]: i for i, m in enumerate(meshes)}
    nodes = []
    def add(name, *, mi=None, translation=(0, 0, 0), rotation=(0, 0, 0, 1), children=(), extras=None):
        item = {"name": name, "translation": list(translation), "rotation": list(rotation)}
        if mi is not None: item["mesh"] = mi
        if children: item["children"] = list(children)
        if extras: item["extras"] = extras
        nodes.append(item)
        return len(nodes) - 1

    center = add("central_sun", mi=by_name["central_sun"], translation=(0, 0.28, 0))
    orbit_specs = [
        ("inner", 0.31, 0, (math.radians(12), 0, math.radians(17))),
        ("middle", 0.53, 0.28, (math.radians(-22), 0, math.radians(11))),
        ("outer", 0.75, -0.27, (math.radians(31), 0, math.radians(-19))),
    ]
    roots = [center]
    for name, radius, height, euler in orbit_specs:
        rotation = quat_euler(*euler)
        body = add(f"body_{name}", mi=by_name[f"body_{name}"], translation=(radius, 0, 0))
        body_pivot = add(f"body_{name}_pivot", children=(body,), extras={"pivotAxisLocal": [0, 1, 0], "pivotOrigin": [0, 0, 0], "neutralRotation": [0, 0, 0, 1]})
        track = add(f"orbit_{name}_track", mi=by_name[f"orbit_{name}_track"])
        orbit = add(f"orbit_{name}_pivot", translation=(0, 0.28 + height, 0), rotation=rotation, children=(track, body_pivot),
                    extras={"pivotAxisLocal": [0, 1, 0], "pivotOrigin": [0, 0.28 + height, 0], "neutralRotation": list(rotation), "radius": radius})
        roots.append(orbit)
    foot = add("foot_ring", mi=by_name["foot_ring"], translation=(0, -0.77, 0))
    column = add("support_column", mi=by_name["support_column"], translation=(0, -0.70, 0))
    collar = add("top_collar", mi=by_name["top_collar"], translation=(0, -0.08, 0))
    base = add("base_pedestal", mi=by_name["base_pedestal"], translation=(0, -0.96, 0))
    inset = add("base_inset", mi=by_name["base_inset"], translation=(0, -0.88, 0))
    roots += [foot, column, collar, base, inset]
    return meshes, nodes, roots


def align4(b): return b + b"\0" * ((-len(b)) % 4)


def write_glb(path, meshes, nodes, roots):
    binary, views, accessors, gltf_meshes = bytearray(), [], [], []
    for m in meshes:
        start = len(binary); raw = b"".join(struct.pack("<3f", *v) for v in m["positions"])
        binary.extend(raw); binary.extend(b"\0" * ((-len(binary)) % 4))
        view = len(views); views.append({"buffer": 0, "byteOffset": start, "byteLength": len(raw), "target": 34962})
        lo = [min(v[k] for v in m["positions"]) for k in range(3)]; hi = [max(v[k] for v in m["positions"]) for k in range(3)]
        pos = len(accessors); accessors.append({"bufferView": view, "componentType": 5126, "count": len(m["positions"]), "type": "VEC3", "min": lo, "max": hi})
        start = len(binary); raw = b"".join(struct.pack("<3f", *v) for v in m["normals"])
        binary.extend(raw); binary.extend(b"\0" * ((-len(binary)) % 4))
        view = len(views); views.append({"buffer": 0, "byteOffset": start, "byteLength": len(raw), "target": 34962})
        normal = len(accessors); accessors.append({"bufferView": view, "componentType": 5126, "count": len(m["normals"]), "type": "VEC3"})
        gltf_meshes.append({"name": m["name"], "primitives": [{"attributes": {"POSITION": pos, "NORMAL": normal}, "material": m["material"], "mode": 4}]})
    doc = {"asset": {"version": "2.0", "generator": "build_orrery.py"}, "scene": 0,
           "scenes": [{"name": "Orrery interface prop", "nodes": roots}], "nodes": nodes, "meshes": gltf_meshes,
           "materials": [{"name": m["name"], "pbrMetallicRoughness": {"baseColorFactor": m["baseColorFactor"], "metallicFactor": m["metallicFactor"], "roughnessFactor": m["roughnessFactor"]}} for m in MATERIALS],
           "accessors": accessors, "bufferViews": views, "buffers": [{"byteLength": len(binary)}],
           "extras": {"coordinateSystem": "right-handed, Y-up, normalized scene units", "usesExternalResources": False}}
    js, data = align4(json.dumps(doc, separators=(",", ":")).encode()), align4(bytes(binary))
    total = 12 + 8 + len(js) + 8 + len(data)
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(data), b"BIN\0") + data)
    return doc


def global_meshes(meshes, nodes):
    out = []
    def walk(index, parent_q=(0, 0, 0, 1), parent_t=(0, 0, 0)):
        node = nodes[index]; q = qmul(parent_q, tuple(node.get("rotation", (0, 0, 0, 1))))
        local = qrotate(parent_q, tuple(node.get("translation", (0, 0, 0))))
        t = tuple(parent_t[i] + local[i] for i in range(3))
        if "mesh" in node:
            m = meshes[node["mesh"]]
            out.append((m, [(tuple(qrotate(q, p)[i] + t[i] for i in range(3)), norm(qrotate(q, n))) for p, n in zip(m["positions"], m["normals"])]))
        for child in node.get("children", []): walk(child, q, t)
    for root in [i for i, n in enumerate(nodes) if not any(i in n.get("children", []) for n in nodes)]:
        walk(root)
    return out


def png_chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)


def render_png(path, meshes, nodes, roots, width=512, height=512, camera=(2.6, 2.15, 4.2), spin=0):
    # Apply a test rotation to the outer orbit's child body while keeping the rail stationary.
    if spin:
        import copy
        nodes = copy.deepcopy(nodes)
        pivot = next(i for i, n in enumerate(nodes) if n["name"] == "body_outer_pivot")
        nodes[pivot]["rotation"] = list(quat_euler(0, math.radians(spin), 0))
    triangles = global_meshes(meshes, nodes)
    cam = norm(camera); forward = tuple(-x for x in cam)
    right = norm((forward[2], 0, -forward[0])); up = norm((forward[1] * right[2] - forward[2] * right[1], forward[2] * right[0] - forward[0] * right[2], forward[0] * right[1] - forward[1] * right[0]))
    light = norm((-0.45, 0.82, 0.48)); scale = min(width, height) * (0.42 if min(width, height) <= 128 else 0.34)
    zbuf = [-1e9] * (width * height); pixels = bytearray(width * height * 4)
    for m, verts in triangles:
        color = MATERIALS[m["material"]]["baseColorFactor"][:3]
        for k in range(0, len(verts), 3):
            points, normals = [], []
            for p, n in verts[k:k + 3]:
                points.append((width / 2 + sum(p[a] * right[a] for a in range(3)) * scale,
                               height / 2 - sum(p[a] * up[a] for a in range(3)) * scale,
                               sum(p[a] * cam[a] for a in range(3))))
                normals.append(n)
            (x0,y0,z0),(x1,y1,z1),(x2,y2,z2)=points
            area=(x1-x0)*(y2-y0)-(y1-y0)*(x2-x0)
            if abs(area)<1e-6: continue
            for py in range(max(0,int(min(y0,y1,y2))), min(height-1,int(max(y0,y1,y2))+1)+1):
                for px in range(max(0,int(min(x0,x1,x2))), min(width-1,int(max(x0,x1,x2))+1)+1):
                    xx,yy=px+0.5,py+0.5
                    a=((x1-xx)*(y2-yy)-(y1-yy)*(x2-xx))/area; b=((x2-xx)*(y0-yy)-(y2-yy)*(x0-xx))/area; c=1-a-b
                    if min(a,b,c)<-1e-5: continue
                    depth=a*z0+b*z1+c*z2; idx=py*width+px
                    if depth<=zbuf[idx]: continue
                    zbuf[idx]=depth
                    n=norm(tuple(a*normals[0][i]+b*normals[1][i]+c*normals[2][i] for i in range(3)))
                    shade=min(1.1,0.38+max(0,sum(n[i]*light[i] for i in range(3)))*0.74)
                    for ch in range(3):
                        linear=max(0,min(1,color[ch]*shade))
                        pixels[idx*4+ch]=round((1.055*linear**(1/2.4)-0.055)*255) if linear>0.0031308 else round(linear*12.92*255)
                    pixels[idx*4+3]=255
    raw=b"".join(b"\0"+pixels[y*width*4:(y+1)*width*4] for y in range(height))
    path.write_bytes(b"\x89PNG\r\n\x1a\n"+png_chunk(b"IHDR",struct.pack(">IIBBBBB",width,height,8,6,0,0,0))+png_chunk(b"IDAT",zlib.compress(raw,9))+png_chunk(b"IEND",b""))


def validate(path, max_tris, max_bytes):
    data=path.read_bytes(); magic,version,total=struct.unpack_from("<4sII",data)
    assert magic==b"glTF" and version==2 and total==len(data)
    n,kind=struct.unpack_from("<I4s",data,12); assert kind==b"JSON"
    doc=json.loads(data[20:20+n].decode().rstrip(" \t\r\n\0")); pos=20+n
    bn,bkind=struct.unpack_from("<I4s",data,pos); assert bkind==b"BIN\0" and pos+8+bn==len(data)
    assert not doc.get("extensionsUsed") and not doc.get("extensionsRequired")
    assert len(doc["materials"])<=3 and len(data)<=max_bytes
    binary=data[pos+8:pos+8+bn]
    tris=0
    for m in doc["meshes"]:
        for primitive in m["primitives"]:
            pa=doc["accessors"][primitive["attributes"]["POSITION"]]; na=doc["accessors"][primitive["attributes"]["NORMAL"]]
            pv=doc["bufferViews"][pa["bufferView"]]; nv=doc["bufferViews"][na["bufferView"]]
            points=[struct.unpack_from("<3f",binary,pv.get("byteOffset",0)+pa.get("byteOffset",0)+i*12) for i in range(pa["count"])]
            normals=[struct.unpack_from("<3f",binary,nv.get("byteOffset",0)+na.get("byteOffset",0)+i*12) for i in range(na["count"])]
            assert len(points)==len(normals) and len(points)%3==0 and primitive["mode"]==4
            for i in range(0,len(points),3):
                a,b,c=points[i:i+3]; e1=tuple(b[k]-a[k] for k in range(3)); e2=tuple(c[k]-a[k] for k in range(3))
                face=(e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0])
                avg=tuple(sum(normals[j][k] for j in (i,i+1,i+2)) for k in range(3))
                if sum(v*v for v in face)>1e-14: assert sum(face[k]*avg[k] for k in range(3))>0, f"winding mismatch in {m['name']} triangle {i//3}"
            tris += pa["count"]//3
    assert tris<=max_tris
    assert not any("uri" in obj for obj in [*doc.get("buffers",[]),*doc.get("images",[])])
    names={n["name"] for n in doc["nodes"]}
    assert {"central_sun","orbit_inner_pivot","orbit_middle_pivot","orbit_outer_pivot","body_inner_pivot","body_middle_pivot","body_outer_pivot"}<=names
    by_name={n["name"]:n for n in doc["nodes"]}
    for orbit in ("inner","middle","outer"):
        assert by_name[f"orbit_{orbit}_pivot"]["children"]
        assert by_name[f"body_{orbit}_pivot"]["children"]
        child=doc["nodes"][by_name[f"body_{orbit}_pivot"]["children"][0]]
        offset=tuple(child.get("translation",(0,0,0)))
        spun=qrotate(quat_euler(0,math.radians(45),0),offset)
        assert math.isclose(math.sqrt(sum(v*v for v in offset)),math.sqrt(sum(v*v for v in spun)),rel_tol=1e-7)
        assert math.dist(offset,spun)>0.01, f"body_{orbit} pivot must move its child"
    visiting=set(); visited=set()
    def visit(index):
        assert index not in visiting, "node cycle"
        assert index not in visited, "node has multiple parents"
        visiting.add(index)
        for child in doc["nodes"][index].get("children",[]): visit(child)
        visiting.remove(index); visited.add(index)
    scene_roots=doc["scenes"][doc["scene"]]["nodes"]
    assert len(scene_roots)==len(set(scene_roots))
    for index in scene_roots: visit(index)
    assert len(visited)==len(doc["nodes"]), "orphan node"
    assert all(len(doc["accessors"][p["attributes"]["POSITION"]]["min"])==3 for m in doc["meshes"] for p in m["primitives"])
    return doc, tris


def main():
    variants={"main":(64,8,24,14,48),"lite":(32,6,14,9,24)}
    info={"asset":"orrery-interface-prop","version":"codex-v1","generator":"Python standard-library procedural geometry; custom GLB 2.0 exporter",
          "unit":"normalized scene units","upAxis":"+Y","rightHanded":True,"materials":MATERIALS,"textures":[],"externalUris":[],"extensionsUsed":[],"extensionsRequired":[],"nodes":[],"variants":{},"status":"technical prototype; Blender visual acceptance pending"}
    for variant,detail in variants.items():
        meshes,nodes,roots=scene(*detail); path=OUT/f"orrery-{variant}-v1.glb"
        doc=write_glb(path,meshes,nodes,roots); checked,tris=validate(path,16000 if variant=="main" else 6000,3_000_000 if variant=="main" else 1_500_000)
        assert doc==checked
        info["variants"][variant]={"file":path.name,"bytes":path.stat().st_size,"triangles":tris,"meshCount":len(meshes),"nodeCount":len(nodes),"materialCount":len(MATERIALS),"textures":0,"validation":{"validGlb2":True,"externalUris":0,"extensions":0,"pivotNodes":6}}
        if variant=="main":
            parents={child:node["name"] for node in nodes for child in node.get("children",[])}
            info["nodes"]=[{"name":n["name"],"parent":parents.get(i),"children":[nodes[c]["name"] for c in n.get("children",[])],"mesh":doc["meshes"][n["mesh"]]["name"] if "mesh" in n else None,**({"pivotAxisLocal":n["extras"]["pivotAxisLocal"],"pivotOrigin":n["extras"]["pivotOrigin"],"neutralRotation":n["extras"]["neutralRotation"],"orbitRadius":n["extras"].get("radius")} if "extras" in n else {})} for i,n in enumerate(nodes)]
            render_png(OUT/"orrery-front.png",meshes,nodes,roots,camera=(0,1,8))
            render_png(OUT/"orrery-three-quarter.png",meshes,nodes,roots)
            render_png(OUT/"orrery-orbit-45.png",meshes,nodes,roots,spin=45)
            render_png(OUT/"orrery-front-128.png",meshes,nodes,roots,width=128,height=128)
            info["previews"]=[{"file":"orrery-front.png","width":512,"height":512,"alpha":True,"view":"front"},
                              {"file":"orrery-three-quarter.png","width":512,"height":512,"alpha":True,"view":"three-quarter"},
                              {"file":"orrery-orbit-45.png","width":512,"height":512,"alpha":True,"view":"outer body pivot +45 degrees"}]
    info["fallback"]={"file":"orrery-front-128.png","width":128,"height":128,"alpha":True,"renderedFrom":"same generated triangle mesh; software orthographic rasterizer"}
    info["notes"]=["Neutral authored interface prop; orbital radii and bodies are visual placeholders, not canonical celestial data or game values.","Six pivot nodes are separate from their child meshes: three orbit pivots and three body pivots.","No textures, external resources, animations, or automatic motion."]
    (OUT/"model-info.json").write_text(json.dumps(info,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(info["variants"],ensure_ascii=False,indent=2))


if __name__=="__main__": main()
