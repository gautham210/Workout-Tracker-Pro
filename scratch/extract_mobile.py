import json
import os
import re

transcript_path = r"C:\Users\achuk\.gemini\antigravity-ide\brain\e7a32feb-6381-4637-be1d-85581baf8c4d\.system_generated\logs\transcript.jsonl"
target_dir = r"C:\dev\Workout Tracker Pro\mobile"

file_contents = {}

def normalize_path(p):
    return p.replace("\\", "/").lower()

with open(transcript_path, 'r', encoding='utf-8') as f:
    for line in f:
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except:
            continue
            
        if 'tool_calls' in entry:
            for call in entry['tool_calls']:
                if call.get('name') == 'write_to_file':
                    args = call.get('args', {})
                    target_file = args.get('TargetFile', '').strip('"').strip("'")
                    code_content = args.get('CodeContent', '')
                    
                    if not target_file:
                        continue
                        
                    norm_path = normalize_path(target_file)
                    if "mobile" in norm_path and "workout helper pro" in norm_path:
                        rel_path = norm_path.split("mobile/")[-1].lstrip("/")
                        try:
                            content = json.loads(code_content)
                        except:
                            content = code_content.strip('"')
                            content = content.replace('\\n', '\n').replace('\\"', '"').replace('\\t', '\t').replace('\\\\', '\\')
                            
                        # Only update if it's the latest version
                        file_contents[rel_path] = content
                        
                elif call.get('name') == 'replace_file_content':
                    args = call.get('args', {})
                    target_file = args.get('TargetFile', '').strip('"').strip("'")
                    if not target_file:
                        continue
                    
                    norm_path = normalize_path(target_file)
                    if "mobile" in norm_path and "workout helper pro" in norm_path:
                        rel_path = norm_path.split("mobile/")[-1].lstrip("/")
                        
                        target_content = args.get('TargetContent', '').strip('"').replace('\\n', '\n').replace('\\"', '"').replace('\\t', '\t').replace('\\\\', '\\')
                        repl_content = args.get('ReplacementContent', '').strip('"').replace('\\n', '\n').replace('\\"', '"').replace('\\t', '\t').replace('\\\\', '\\')
                        
                        if rel_path in file_contents:
                            file_contents[rel_path] = file_contents[rel_path].replace(target_content, repl_content)
                            
                elif call.get('name') == 'multi_replace_file_content':
                    args = call.get('args', {})
                    target_file = args.get('TargetFile', '').strip('"').strip("'")
                    if not target_file:
                        continue
                        
                    norm_path = normalize_path(target_file)
                    if "mobile" in norm_path and "workout helper pro" in norm_path:
                        rel_path = norm_path.split("mobile/")[-1].lstrip("/")
                        
                        if rel_path in file_contents:
                            chunks = args.get('ReplacementChunks', '[]')
                            if isinstance(chunks, str):
                                try:
                                    chunks = json.loads(chunks)
                                except:
                                    chunks = []
                            for chunk in chunks:
                                target_content = chunk.get('TargetContent', '').strip('"').replace('\\n', '\n').replace('\\"', '"').replace('\\t', '\t').replace('\\\\', '\\')
                                repl_content = chunk.get('ReplacementContent', '').strip('"').replace('\\n', '\n').replace('\\"', '"').replace('\\t', '\t').replace('\\\\', '\\')
                                file_contents[rel_path] = file_contents[rel_path].replace(target_content, repl_content)

for rel_path, content in file_contents.items():
    try:
        content = content.encode('utf-8').decode('unicode_escape')
    except:
        pass
    
    out_path = os.path.join(target_dir, rel_path)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', encoding='utf-8') as out_f:
        out_f.write(content)
        print(f"Wrote {out_path} ({len(content)} bytes)")
