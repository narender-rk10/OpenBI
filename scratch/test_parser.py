import re

def parse_sources():
    with open("frontend/src/lib/sources.ts", "r", encoding="utf-8") as f:
        content = f.read()

    # Find all indexes of engine start: {\s*name:\s*.*engine:
    starts = [m.start() for m in re.finditer(r"\{\s*name:\s*['\"][^'\"]+['\"]\s*,\s*engine:\s*", content)]
    
    engines = []
    for i, start in enumerate(starts):
        # Extract text from this start to either the next start or end
        end = starts[i+1] if i + 1 < len(starts) else len(content)
        block = content[start:end]
        
        # Parse name, engine, category
        name_m = re.search(r"name:\s*['\"]([^'\"]+)['\"]", block)
        engine_m = re.search(r"engine:\s*['\"]([^'\"]+)['\"]", block)
        cat_m = re.search(r"category:\s*['\"]([^'\"]+)['\"]", block)
        
        if not name_m or not engine_m or not cat_m:
            continue
            
        name = name_m.group(1)
        engine = engine_m.group(1)
        category = cat_m.group(1)
        
        # Find all fields within this block.
        # Fields are defined inside fields: [ ... ]
        fields_m = re.search(r"fields:\s*\[(.*?)\]", block, re.DOTALL)
        fields = []
        if fields_m:
            fields_text = fields_m.group(1)
            # Find each field: { name: '...', ... }
            field_matches = re.finditer(r"\{\s*name:\s*['\"]([^'\"]+)['\"]", fields_text)
            for fm in field_matches:
                f_name = fm.group(1)
                # Let's also see if the field is required: check if required: true is near it
                # We extract the text for this field object
                f_start = fm.start()
                f_end = fields_text.find("}", f_start)
                f_block = fields_text[f_start:f_end]
                
                required = "required: true" in f_block
                # Parse type
                type_m = re.search(r"type:\s*['\"]([^'\"]+)['\"]", f_block)
                f_type = type_m.group(1) if type_m else "text"
                
                fields.append({
                    "name": f_name,
                    "type": f_type,
                    "required": required
                })
        
        engines.append({
            "name": name,
            "engine": engine,
            "category": category,
            "fields": fields
        })
        
    return engines

if __name__ == "__main__":
    engines = parse_sources()
    print(f"Total parsed engines: {len(engines)}")
    for e in engines[:5]:
        print(f"\nEngine: {e['engine']} ({e['name']}) - {e['category']}")
        print(f"Fields: {e['fields']}")
