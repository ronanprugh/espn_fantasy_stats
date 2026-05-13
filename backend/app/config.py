import os
from dotenv import load_dotenv

load_dotenv()

LEAGUE_ID = int(os.environ["LEAGUE_ID"])
ESPN_S2 = os.environ.get("ESPN_S2") or None
SWID = os.environ.get("SWID") or None

CACHE_PATH = os.environ.get("CACHE_PATH", "espn_cache.sqlite")
