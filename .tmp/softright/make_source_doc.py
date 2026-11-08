from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[2]
out = root / 'softright/text/国际学生单车租赁系统源代码.md'
files = [
    'backend/src/server.js', 'backend/src/app.js', 'backend/src/config/db.js',
    'backend/src/middleware/auth.js', 'backend/src/middleware/role.js',
    'backend/src/routes/auth.js', 'backend/src/routes/bikes.js', 'backend/src/routes/orders.js',
    'backend/src/routes/stations.js', 'backend/src/routes/ai.js', 'backend/src/ai/agent.js',
    'backend/src/ai/provider/base.js', 'backend/src/ai/provider/ollama.js', 'backend/src/ai/tools/index.js',
    'frontend/src/App.vue', 'frontend/src/router/index.js', 'frontend/src/stores/auth.js',
    'frontend/src/stores/ai.js', 'frontend/src/components/ChatWidget.vue', 'frontend/src/views/Login.vue',
    'frontend/src/views/Bikes.vue', 'frontend/src/views/Orders.vue', 'frontend/src/assets/style.css',
    'android/app/src/main/java/com/xuelinhu/lanwebclient/MainActivity.java',
    'backend/postgres/schema.sql', 'backend/postgres/migrations/005_models_payments_i18n.js'
]
lines = ['# 国际学生单车租赁系统源代码', '', '## 目录', '', '1. 源码选择说明']
for i, f in enumerate(files, 2):
    lines.append(f'{i}. `{f}`')
lines += ['', '## 1 源码选择说明', '', '以下内容来自当前提交的自研业务代码，排除了 node_modules、锁文件、构建产物和第三方源码。代码顺序与仓库相对路径保持一致。', '']
manifest = []
for f in files:
    p = root / f
    if not p.exists():
        continue
    data = p.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    manifest.append({'path': f, 'sha256': digest, 'bytes': len(data)})
    language = 'sql' if p.suffix == '.sql' else 'javascript'
    lines += [f'## 源码文件：`{f}`', '', f'SHA-256：`{digest}`', '', f'```{language}', p.read_text(encoding='utf-8', errors='replace'), '```', '']
out.write_text('\n'.join(lines), encoding='utf-8')
(root / '.tmp/softright/evidence/source_manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
