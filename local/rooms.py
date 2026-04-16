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

def scrape_room(semester, subject, campus):
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
        "CLASS_SRCH_WRK2_STRM$35$": semester,
        "SSR_CLSRCH_WRK_SUBJECT_SRCH$0": subject,
        # "SSR_CLSRCH_WRK_CATALOG_NBR$1": "3253",
        "SSR_CLSRCH_WRK_CAMPUS$2": campus,
    }
    res2 = session.post(url, data=payload)
    pattern = re.compile(
        r'id=\'win0divMTG_CLASS_NBR\$(?P<id>\d+)\'.*?>'  # Find Class Nbr div
        r'.*?>(?P<class_nbr>\d+)<'                       # Capture the number
        r'.*?id=\'MTG_ROOM\$(?P=id)\' >(?P<room>.*?)</span>', # Capture matching Room
        re.DOTALL
    )

    return [
        {"class": m.group('class_nbr'), "room": m.group('room').strip()}
        for m in pattern.finditer(res2.text)
    ]

def scrape_semester_rooms(semester):
    path = Path("./subject.txt")
    with path.open("r", encoding='utf-8') as f:
        subjects = [line.strip() for line in f.readlines()]

    campuses = ["STORR", "ABROD", "AVYPT", "HRTFD", "OFF", "LAW", "STMFD", "UCHC", "WTBY"]
    results = []
    for i, subject in enumerate(subjects,1):
        name = subject

        for campus in campuses:
            data = scrape_room(semester['value'], subject, campus)
            if data is not None:
                results.extend(data)
                print(f"[{i:>{len(str(len(subjects)))}}/{len(subjects)}] Scraped {name} for {semester['name']} in {campus}")

            else:
                    print(f"[{i:>{len(str(len(subjects)))}}/{len(subjects)}] {name} not in {semester['name']} in {campus}")
    return results

if __name__ == '__main__':
    print(scrape_semester_rooms(
  {
    "value": "1268",
    "name": "Fall 2026"
  }
    ))
