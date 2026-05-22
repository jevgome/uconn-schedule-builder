import asyncio
import time
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
            "SSR_CLSRCH_WRK_SSR_OPEN_ONLY$chk$3": "N"
        }

        resp = session.post(URL, data=payload)

        if "returns" in resp.text:
            print(f'{subject} not in {semester["name"]} for {campus}')
            return []

        soup = BeautifulSoup(resp.text, "lxml")

        results = []

        # each course container
        for course_block in soup.select("div[id^='win0divSSR_CLSRSLT_WRK_GROUPBOX2']"):

            # find course name from nearby text
            course_name = None

            text = course_block.get_text(" ", strip=True)

            m = re.search(r'([A-Z]{2,}\s+\d+\w*)', text)
            if m:
                course_name = m.group(1)

            # all meeting rows for this course
            rows = course_block.select("tr[id^='trSSR_CLSRCH_MTG1']")

            for row in rows:
                class_nbr_el = row.select_one("a[id^='MTG_CLASS_NBR']")
                section_el = row.select_one("a[id^='MTG_CLASSNAME']")
                room_el = row.select_one("span[id^='MTG_ROOM']")

                if not (class_nbr_el and section_el and room_el):
                    continue
                
                sec = section_el.contents[0].strip()
                sec = sec[:sec.find("-")]

                results.append({
                    "registration_number": class_nbr_el.text.strip(),
                    "course": course_name,
                    "section": sec,
                    "room": room_el.text.strip()
                })

        print(f'Scraped {subject} in {campus} for {semester["name"]}')

        return results

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


########################################################################################
from geopy.geocoders import Nominatim


# ---------------------------
# STEP 1: SCRAPE TABLE
# ---------------------------
def scrape_buildings():
    r = requests.get("https://scheduling.uconn.edu/storrs-campus-areas/")
    r.raise_for_status()

    soup = BeautifulSoup(r.text, "html.parser")

    table = soup.find("table")
    rows = table.find_all("tr")[1:]  # skip header

    buildings = []

    for row in rows:
        cols = [td.get_text(strip=True) for td in row.find_all("td")]

        if len(cols) == 4:
            obj = {
                "area": cols[0],
                "area_name": cols[1],
                "building_name": cols[2],
                "building_code": cols[3],
            }
            buildings.append(obj)

    geolocator = Nominatim(user_agent="uconn_building_mapper")

    cache = {}

    for i, b in enumerate(buildings):
        query = f"{b['building_name']}, Storrs, CT"

        print(f"[{i+1}/{len(buildings)}] Geocoding: {query}")

        if query in cache:
            location = cache[query]
        else:
            try:
                location = geolocator.geocode(query)
                cache[query] = location
                time.sleep(1)  # respect rate limits
            except Exception as e:
                print("Error:", e)
                location = None

        if location:
            b["lat"] = location.latitude
            b["lon"] = location.longitude
            b["address"] = location.address
        else:
            b["lat"] = None
            b["lon"] = None
            b["address"] = None
            print(f'Could not find {b["building_name"]}')

    return buildings

def buildings(campus='STORR'):
    print("Scraping buildings...")
    buildings = scrape_buildings()

    print(f"Found {len(buildings)} buildings")

    return buildings

if __name__ == "__main__":
    sem = {
        "name": "Fall 2026",
        "value": "1268",
    }
    result = scrape_subject(sem, "MUSI")

    for i in result:
        if i:
            print(i)