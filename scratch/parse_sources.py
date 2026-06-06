import re
import json

def parse_sources():
    with open("frontend/src/lib/sources.ts", "r", encoding="utf-8") as f:
        content = f.read()

    # Find blocks of objects: { name: '...', engine: '...', category: '...' }
    # We can match name, engine, category
    pattern = r"name:\s*['\"]([^'\"]+)['\"]\s*,\s*engine:\s*['\"]([^'\"]+)['\"]\s*,\s*category:\s*['\"]([^'\"]+)['\"]"
    matches = re.findall(pattern, content)
    
    print(f"Found {len(matches)} engines:")
    for name, engine, category in matches:
        print(f"Engine: {engine:<20} | Name: {name:<30} | Category: {category}")

if __name__ == "__main__":
    parse_sources()
