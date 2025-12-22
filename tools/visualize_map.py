import json
import sys

try:
    with open('map/data/map_data.js', 'r') as f:
        content = f.read()
        # manual parsing since it's "window.MAP_DATA = [...]"
        json_str = content.split('=', 1)[1].strip()
        # Remove trailing semicolon if exists
        if json_str.endswith(';'):
            json_str = json_str[:-1]
        
        tiles = json.loads(json_str)
        
        # Grid range to view: x=10-25, y=15-30
        for y in range(15, 30):
            row_str = f"{y:2d}: "
            for x in range(10, 26):
                # Find tile
                found = None
                for t in tiles:
                    if t['gx'] == x and t['gy'] == y:
                        found = t
                        break
                
                if found:
                    if found['tx'] == 1 and found['ty'] == 0:
                        row_str += " .  "
                    elif found['tx'] == 22 and found['ty'] == 0:
                        row_str += " #  "
                    else:
                        row_str += f"[{found['tx']},{found['ty']}]"
                else:
                    row_str += "    "
            print(row_str)

except Exception as e:
    print(e)
