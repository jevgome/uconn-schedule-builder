import requests
import sys
from bs4 import BeautifulSoup, SoupStrainer
import time
import json
from pathlib import Path
import asyncio
import aiohttp
import random
import re
from lxml import etree
import time
import re

def scrape_room():
    session = requests.Session()
    url="https://student.studentadmin.uconn.edu/psc/CSGUE/EMPLOYEE/HRMS/c/COMMUNITY_ACCESS.CLASS_SEARCH.GBL"
    res = session.get(url)
    soup = BeautifulSoup(res.text, "html.parser")
    icsid = soup.find("input", {"name": "ICSID"})["value"]
    payload = {
        "ICAJAX": "1",
        "ICNAVTYPEDROPDOWN": "0",
        "ICType": "Panel",
        "ICElementNum": "0",
        "ICAction": "CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH",
        "CLASS_SRCH_WRK2_STRM$35$": "1268",
        "SSR_CLSRCH_WRK_SUBJECT_SRCH$0": "ME",
        "SSR_CLSRCH_WRK_CATALOG_NBR$1": "3253",
        "SSR_CLSRCH_WRK_CAMPUS$2": "STORR",
    }
    res2 = session.post(url, data=payload)
    print(res2.text)

if __name__ == '__main__':
    scrape_room()
