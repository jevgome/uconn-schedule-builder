import requests
import sys
from bs4 import BeautifulSoup, SoupStrainer
import time
import json
from pathlib import Path
import argparse

import catalog
import courses
import rooms

def save_results(data, filename):
    """Save all courses to JSON file."""
    path = Path(filename)
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"✅ Saved {len(data)} courses to {filename}")

def get_current_semesters():
    response = requests.get("https://classes.uconn.edu")
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    sems = soup.find('select', id='crit-srcdb').find_all()
    sem_list = []
    for sem in sems:
        sem_dict = {
            "value": sem['value'],
            "name": sem.get_text(strip=True)
        }
        sem_list.append(sem_dict)
    return sem_list

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description="Main script to refresh data")
    parser.add_argument('--catalog', action='store_true', help='Scrape detailed information of course details (TOI, # credits, etc.).')
    parser.add_argument('--courses', action='store_true', help='Scrape information of courses to enroll.')
    parser.add_argument('--rooms', action='store_true', help='Scrape class room information and buildings.')
    parser.add_argument('-s', '--semester', default='0', help='Sets a semester to scrape data from.')

    parser.add_argument('-o', '--once', action='store_true', help='Run scripts that should only be run once (course details, ...).')
    parser.add_argument('-p', '--per', action='store_true', help='Run scripts that should be run every semester.')
    parser.add_argument('-c', '--constant', action='store_true', help='Run scripts that should be run constantly.')
    parser.add_argument('-a', '--all', action='store_true', help='Run everything.')

    args = parser.parse_args()

    # Run once
    if args.once or args.all:
        course_details = catalog.scrape_course_details()
        save_results(course_details, "../public/courses.json")

    # Run every semester
    with open('../public/semesters.json') as f:
        sem_list = json.load(f)

    if args.per or args.all:
        sem_list = get_current_semesters()
        save_results(sem_list, "../public/semesters.json")

    if args.all or (args.per and not(args.rooms and args.catalog and args.courses) or args.rooms):
        if args.semester == '0':
            for sem in sem_list:
                results = rooms.scrape_semester_rooms(sem)
                save_results(results, f"../public/semesters/{sem['value']}/rooms.json")
        else:
            results = rooms.scrape_semester_rooms(args.semester)
            save_results(results, f"../public/semesters/{args.semester}/rooms.json")

    # Run constantly
    if args.constant or args.all:
        if args.semester == '0':
            for sem in sem_list:
                results = courses.scrape_semester_courses(sem)
                save_results(results, f"../public/semesters/{sem['value']}/classes.json")
        else:
            results = courses.scrape_semester_courses(args.semester)
            save_results(results, f"../public/semesters/{args.semester}/classes.json")


