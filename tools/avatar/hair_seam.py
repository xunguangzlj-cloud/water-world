"""沿两侧原发片的内壁补齐中央开口，共用原图集和发束骨骼。"""
import numpy as np


def inner_hair(left, right):
    source = np.concatenate((left, right))
    pos = source[:, :6].copy().view('<i2') / 32767
    normals = source[:, 8:11].view('i1') / 127
    inner = normals[:, 0] > .46
    z_values = np.linspace(-.124, .128, 27)
    y_values = np.linspace(.151, .313, 19)
    points = np.empty((len(y_values), len(z_values), 3))
    # 缺口两侧的内壁完整。沿左右边缘取样，让补面略微退入发束。
    for row, y in enumerate(y_values):
        edges = []
        for z in (z_values[0], z_values[-1]):
            dist = (pos[:, 1] - y)**2 + (pos[:, 2] - z)**2
            near = np.argsort(np.where(inner, dist, np.inf))[:8]
            edges.append(np.average(pos[near, 0], weights=1 / (dist[near] + .00001)))
        across = np.linspace(0, 1, len(z_values))
        points[row, :, 0] = np.interp(across, [0, 1], edges) + .008 * np.sin(np.pi * across) - .013
        points[row, :, 1] = y
        points[row, :, 2] = z_values

    normal = np.cross(np.gradient(points, axis=0), np.gradient(points, axis=1))
    normal /= np.linalg.norm(normal, axis=2, keepdims=True)
    points = points.reshape(-1, 3)
    packed = np.zeros((len(points), 24), dtype='u1')
    packed[:, :6] = np.rint(points * 32767).astype('<i2').view('u1').reshape(-1, 6)
    packed[:, 8:11] = np.rint(normal.reshape(-1, 3) * 127).astype('i1').view('u1')
    packed[:, 11] = 64
    # 原图集在发梢处有一段连续的内壁纹理，从明亮的侧边渐变到中央的深蓝。
    center = np.clip(1 - np.abs(points[:, 2] - .002) / .126, 0, 1)
    uv = np.column_stack((.1874 + .031 * center, .4754 + .0065 * center))
    packed[:, 12:16] = np.rint(uv * 65535).astype('<u2').view('u1').reshape(-1, 4)
    for i, point in enumerate(points):
        dist = (pos[:, 1] - point[1])**2 + (pos[:, 2] - point[2])**2
        near = np.argpartition(dist, 12)[:12]
        weights = source[near, 20:24] / (dist[near, None] + .000025)
        influence = np.bincount(source[near, 16:20].ravel(), weights=weights.ravel(), minlength=4)
        joints = np.argsort(influence)[-4:][::-1]
        packed[i, 16:20] = joints
        packed[i, 20:24] = np.rint(255 * influence[joints] / influence[joints].sum())
    cols = len(z_values)
    cells = np.arange(len(points)).reshape(-1, cols)[:-1, :-1].ravel()
    faces = np.stack((cells, cells+cols, cells+1, cells+1, cells+cols, cells+cols+1), axis=1)
    return packed, faces.ravel().astype('<u4')
