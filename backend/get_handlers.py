import asyncio
import json
from backend.services.mindsdb_client import mindsdb

async def get_handlers():
    try:
        res = await mindsdb.sql_query("SELECT name FROM information_schema.handlers WHERE type = 'data'")
        handlers = [row[0] for row in res.get('data', [])]
        print(json.dumps(handlers))
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(get_handlers())
