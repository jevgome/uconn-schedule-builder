import asyncio
import requests
from concurrent.futures import ThreadPoolExecutor
from bs4 import BeautifulSoup
import re
from pathlib import Path

URL = "https://student.studentadmin.uconn.edu/psc/CSGUE/EMPLOYEE/HRMS/c/COMMUNITY_ACCESS.CLASS_SEARCH.GBL"

CAMPUSES = ["STORR", "AVYPT", "HRTFD", "OFF", "LAW", "STMFD", "UCHC", "WTBY"]

# -----------------------------
# Thread-local session handling
# -----------------------------
import threading
thread_local = threading.local()

def get_session():
    if not hasattr(thread_local, "session"):
        s = requests.Session()
        s.headers.update({
            "User-Agent": "Mozilla/5.0"
        })
        thread_local.session = s
    return thread_local.session


# -----------------------------
# Core blocking scraper (per subject)
# -----------------------------
def scrape_subject(semester, subject):
    session = get_session()

    # Initial GET (required for PeopleSoft state)
    r = session.get(URL)
    soup = BeautifulSoup(r.text, "html.parser")

    icstate = soup.find("input", {"name": "ICSID"})["value"]

    def scrape_campus(campus):
        payload = {
            "ICAJAX": "1",
            "ICNAVTYPEDROPDOWN": "0",
            "ICType": "Panel",
            "ICElementNum": "0",
            "ICStateNum": "1",
            "ICAction": "CLASS_SRCH_WRK2_SSR_PB_CLASS_SRCH",
            "CLASS_SRCH_WRK2_STRM$35$": semester['value'],
            "SSR_CLSRCH_WRK_SUBJECT_SRCH$0": subject,
            "SSR_CLSRCH_WRK_CAMPUS$2": campus,
        }

        resp = session.post(URL, data=payload)

        if "returns" in resp.text:
            print(f'{subject} not in {semester["name"]} for {campus}')
            return []

        pattern = re.compile(
            r"id='win0divMTG_CLASS_NBR\$(?P<id>\d+)'.*?>"
            r".*?>(?P<class_nbr>\d+)<"
            r".*?id='MTG_ROOM\$(?P=id)' >(?P<room>.*?)</span>",
            re.DOTALL
        )

        print(f'Scraped {subject} in {campus} for {semester["name"]}')
        return [
            {
                "class": m.group("class_nbr"),
                "room": m.group("room").strip()
            }
            for m in pattern.finditer(resp.text)
        ]

    results = []

    # Thread pool for campuses (inside subject)
    with ThreadPoolExecutor(max_workers=8) as executor:
        for data in executor.map(scrape_campus, CAMPUSES):
            results.extend(data)

    return results


# -----------------------------
# Async orchestrator (subjects)
# -----------------------------
async def scrape_all(semester):
    subjects = Path("subject.txt").read_text().splitlines()
    subjects = [s.strip() for s in subjects if s.strip()]

    results = []
    loop = asyncio.get_running_loop()

    # Limit concurrent subjects (VERY important for PeopleSoft stability)
    semaphore = asyncio.Semaphore(4)

    def run_subject(subject):
        return scrape_subject(semester, subject)

    async def bound_scrape(subject):
        async with semaphore:
            return await loop.run_in_executor(None, run_subject, subject)

    tasks = [bound_scrape(sub) for sub in subjects]

    for coro in asyncio.as_completed(tasks):
        data = await coro
        if data:
            results.extend(data)

    return results

def scrape_semester_rooms(semester):
    return asyncio.run(scrape_all(semester))
