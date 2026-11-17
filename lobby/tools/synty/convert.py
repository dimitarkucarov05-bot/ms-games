# Blender 3.6, без прозорец:  blender -b --factory-startup -P convert.py -- jobs.json
# Обръща Synty FBX в GLB без вградени текстури (текстурата на пакета се зарежда веднъж в играта)
# и смалява текстурите. Пише отчет: триъгълници, размери, материали.
import bpy, sys, json, os

argv = sys.argv[sys.argv.index('--') + 1:]
jobs = json.load(open(argv[0], encoding='utf-8'))
report = {'models': [], 'textures': []}

def image_of(mat):
    if not mat or not mat.use_nodes:
        return None
    for n in mat.node_tree.nodes:
        if n.type == 'TEX_IMAGE' and n.image:
            return os.path.basename(n.image.filepath.replace(chr(92), '/'))
    return None

for job in jobs.get('models', []):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    entry = {'name': job['name']}
    try:
        bpy.ops.import_scene.fbx(filepath=job['fbx'], use_anim=bool(job.get('anim')))
        objs = list(bpy.context.scene.objects)
        meshes = [o for o in objs if o.type == 'MESH']
        if not meshes:
            raise RuntimeError('no mesh')
        deps = bpy.context.evaluated_depsgraph_get()
        tris = 0
        lo = [1e9, 1e9, 1e9]; hi = [-1e9, -1e9, -1e9]
        mats = {}
        for o in meshes:
            me = o.evaluated_get(deps).to_mesh()
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
            for v in me.vertices:
                w = o.matrix_world @ v.co
                for i in range(3):
                    lo[i] = min(lo[i], w[i]); hi[i] = max(hi[i], w[i])
            for slot in o.material_slots:
                if slot.material:
                    mats[slot.material.name] = image_of(slot.material)
        # Blender е Z нагоре; в играта Y е нагоре: (x, y, z) -> (x, z, -y)
        entry['tris'] = tris
        entry['size'] = [round(hi[0] - lo[0], 3), round(hi[2] - lo[2], 3), round(hi[1] - lo[1], 3)]
        entry['min'] = [round(lo[0], 3), round(lo[2], 3), round(-hi[1], 3)]
        entry['max'] = [round(hi[0], 3), round(hi[2], 3), round(-lo[1], 3)]
        entry['materials'] = [{'name': k, 'image': v} for k, v in mats.items()]
        entry['skinned'] = any(o.type == 'ARMATURE' for o in objs)
        for mat in bpy.data.materials:
            if mat.use_nodes:
                for n in list(mat.node_tree.nodes):
                    if n.type == 'TEX_IMAGE':
                        mat.node_tree.nodes.remove(n)
        os.makedirs(os.path.dirname(job['out']), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=job['out'], export_format='GLB', export_image_format='NONE',
            export_apply=not entry['skinned'], export_yup=True, export_animations=bool(job.get('anim')),
            export_skins=True, export_materials='EXPORT', export_tangents=False, export_colors=False,
            export_cameras=False, export_lights=False)
        entry['bytes'] = os.path.getsize(job['out'])
    except Exception as e:
        entry['error'] = str(e)
    report['models'].append(entry)
    print('MODEL', json.dumps(entry, ensure_ascii=False))

for t in jobs.get('textures', []):
    entry = {'src': t['src'], 'out': t['out']}
    try:
        img = bpy.data.images.load(t['src'])
        w, h = img.size
        size = int(t.get('size', 1024))
        if max(w, h) > size:
            k = size / max(w, h)
            img.scale(max(1, int(w * k)), max(1, int(h * k)))
        os.makedirs(os.path.dirname(t['out']), exist_ok=True)
        img.filepath_raw = t['out']; img.file_format = 'PNG'
        img.save()
        entry['size'] = list(img.size); entry['from'] = [w, h]
        bpy.data.images.remove(img)
    except Exception as e:
        entry['error'] = str(e)
    report['textures'].append(entry)

json.dump(report, open(jobs['report'], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('DONE', len(report['models']), 'models', len(report['textures']), 'textures')
