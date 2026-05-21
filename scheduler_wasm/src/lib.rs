// wasm-pack build --target web --out-dir ../src/wasm_pkg

use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use std::collections::HashMap;
use web_sys::console;

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}
//
// =========================
// CORE STRUCTS
// =========================
//

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Block {
    pub day: String,
    pub start_min: u16,
    pub end_min: u16,

    pub class_section: String,
    pub instructor: String,
    pub room: String,
    pub registration_number: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Section {
    pub registration_number: String,
    pub subject: String,
    pub catalog_number: String,

    pub academic_career: String,
    pub campus: String,
    pub session: String,
    pub instruction_mode: String,

    pub enrollment_capacity: u32,
    pub enrollment_total: u32,
    pub seats_available: u32,
    pub capacity_available: String,
    pub waitlist_available: u32,

    pub blocks: Vec<Block>,
}

//
// =========================
// JSON OUTPUT STRUCTS
// =========================
//

#[derive(Debug, Clone, Serialize)]
pub struct Schedule {
    pub sections: Vec<Section>,
}

//
// =========================
// WASM ENTRY POINT
// =========================
//
#[wasm_bindgen]
pub fn generate_schedules_from_sections(sections: JsValue) -> String {
    let sections: Vec<Section> =
        serde_wasm_bindgen::from_value(sections).unwrap();

    let grouped = group_by_course(sections);

    let course_groups: Vec<Vec<Section>> =
        grouped.into_iter().map(|(_, v)| v).collect();

    let mut results = Vec::new();
    let mut current = Vec::new();

    backtrack(&course_groups, 0, &mut current, &mut results);

    schedules_to_json(results)
}

//
// =========================
// SECTION BUILDING
// =========================
//
fn build_sections(
    course_list: Vec<String>,
    raw_data: Vec<RawCourseEntry>,
    room_data: Vec<RoomEntry>,
    allowed_campuses: Vec<String>,
) -> Vec<Section> {
    let mut sections = Vec::new();

    // =========================
    // STEP 1: build lecture map
    // =========================
    let mut lecture_map: HashMap<LectureKey, RawCourseEntry> = HashMap::new();

    for entry in &raw_data {
        if !allowed_campuses.contains(&entry.campus) {
            continue;
        }

        let course_code = format!("{} {}", entry.subject, entry.catalog_number);

        if course_list.contains(&course_code) && entry.registration_number.is_empty() {
            let key = LectureKey {
                subject: entry.subject.clone(),
                catalog_number: entry.catalog_number.clone(),
                class_section: entry.class_section.clone(),
            };
            lecture_map.insert(key, entry.clone());
        }
    }

    // =========================
    // STEP 2: build sections
    // =========================
    let mut lecture = RoomEntry::new();
    for (index, entry) in raw_data.iter().enumerate() {
        if !allowed_campuses.contains(&entry.campus) {
            continue;
        }

        let course_code = format!("{} {}", entry.subject, entry.catalog_number);

        if !course_list.contains(&course_code) {
            continue;
        }

        // Skip lecture rows as schedulable items
        if entry.registration_number.is_empty() {
            let mut min_number = 9999999;
            let mut i = index + 1;
            while i < raw_data.len()
                && raw_data[i].subject == entry.subject 
                && raw_data[i].catalog_number == entry.catalog_number 
                && !raw_data[i].registration_number.is_empty() 
            {
                let current_number = raw_data[i].registration_number.parse().unwrap();
                if current_number < min_number {min_number = current_number;}
                i += 1;
            }
            lecture_number = min_number-1;
            continue;
        }

        // Default: standalone section (no lecture dependency)
        let mut lecture_opt: Option<&RawCourseEntry> = None;

        // Check if this lab links to a lecture
        for (lecture_section, lecture) in &lecture_map {
            if entry.additional_sections.contains(&lecture_section.class_section) && entry.subject == lecture_section.subject && entry.catalog_number == lecture_section.catalog_number {
                lecture_opt = Some(lecture);
                break;
            }
        }

        let section = match lecture_opt {
            Some(lecture) => {
                // let room = room_data.iter()
                //     .find(|s| s.class == lecture_number);
                //
                // if room.is_none() {
                //     console::log_1(
                //         &format!(
                //             "Missing room entry.\nlecture_number={}",
                //             lecture_number,
                //         ).into()
                //     );
                // }

                // let room = room.unwrap();
                let lab_room = room_data.iter().find(|&s| s.class == entry.registration_number).unwrap();
                while room_data.iter().find(|&s| s.class == lecture_number.to_string()).is_none() {
                    lecture_number -= 1;
                }
                let lecture_room = room_data.iter().find(|&s| s.class == lecture_number.to_string()).unwrap();

                build_section_from_lab(entry, lecture, lab_room, lecture_room)
            },
            None => {
                let room_entry = room_data.iter().find(|&s| s.class == entry.registration_number).unwrap();
                build_standalone_section(entry, room_entry)
            },
        };

        //Check to make sure a section isn't in conflict with itself
        if section.blocks.len() < 2 {
            sections.push(section);
            continue;
        }
        let mut conflict = false;
        'outer: for i in 0..(section.blocks.len() - 1) {
            let ba = &section.blocks[i];
            if ba.start_min == ba.end_min && ba.start_min == 0 {
                continue;
            }

            for j in (i+1)..(section.blocks.len()) {
                let bb = &section.blocks[j];
                if bb.start_min == bb.end_min && bb.start_min == 0 {
                    continue;
                }
                if ba.day == bb.day
                    && ba.start_min < bb.end_min + 15
                    && bb.start_min < ba.end_min + 15
                {
                    conflict = true;
                    break 'outer;
                }
            }
        }
        if !conflict {
            sections.push(section);
        }
    }

    sections
}

fn build_standalone_section(entry: &RawCourseEntry, room_entry: &RoomEntry) -> Section {
    let capacity = entry.enrollment_capacity.parse().unwrap_or(0);
    let total = entry.enrollment_total.parse().unwrap_or(0);
    let seats = entry.seats_available.parse().unwrap_or(0);
    let waitlist = entry.waitlist_available.parse().unwrap_or(0);

    let blocks = parse_meeting_times(
        &entry.meeting_times,
        &entry.class_section,
        &entry.instructor,
        &room_entry,
    )
    .map(|m| m.blocks)
    .unwrap_or(vec![]);

    Section {
        registration_number: entry.registration_number.clone(),
        subject: entry.subject.clone(),
        catalog_number: entry.catalog_number.clone(),

        academic_career: entry.academic_career.clone(),
        campus: entry.campus.clone(),
        session: entry.session.clone(),
        instruction_mode: entry.instruction_mode.clone(),

        enrollment_capacity: capacity,
        enrollment_total: total,
        seats_available: seats,
        capacity_available: entry.capacity_available.clone(),
        waitlist_available: waitlist,

        blocks,
    }
}

fn build_section_from_lab(
    lab: &RawCourseEntry,
    lecture: &RawCourseEntry,
    lab_room: &RoomEntry,
    lecture_room: &RoomEntry,
) -> Section {
    let capacity = lab.enrollment_capacity.parse().unwrap_or(0);
    let total = lab.enrollment_total.parse().unwrap_or(0);
    let seats = lab.seats_available.parse().unwrap_or(0);
    let waitlist = lab.waitlist_available.parse().unwrap_or(0);

    // =========================
    // LAB blocks (enrollable time)
    // =========================
    let mut blocks = parse_meeting_times(
        &lab.meeting_times,
        &lab.class_section,
        &lab.instructor,
        &lab_room,
    )
    .map(|m| m.blocks)
    .unwrap_or(vec![]);

    if let Some(mut lecture_blocks) = parse_meeting_times(
        &lecture.meeting_times,
        &lecture.class_section,
        &lecture.instructor,
        &lecture_room,
    ) {
        blocks.append(&mut lecture_blocks.blocks);
    }

    Section {
        registration_number: lab.registration_number.clone(),

        subject: lecture.subject.clone(),
        catalog_number: lecture.catalog_number.clone(),

        academic_career: lecture.academic_career.clone(),
        campus: lecture.campus.clone(),
        session: lecture.session.clone(),
        instruction_mode: lab.instruction_mode.clone(),

        enrollment_capacity: capacity,
        enrollment_total: total,
        seats_available: seats,
        capacity_available: lab.capacity_available.clone(),
        waitlist_available: waitlist,

        blocks,
    }
}
//
// =========================
// GROUPING
// =========================
//

fn group_by_course(sections: Vec<Section>) -> HashMap<String, Vec<Section>> {
    let mut map: HashMap<String, Vec<Section>> = HashMap::new();

    for section in sections {
        let key = format!("{} {}", section.subject, section.catalog_number);
        map.entry(key).or_default().push(section);
    }

    map
}

//
// =========================
// BACKTRACKING (STRICT)
// =========================
//

fn backtrack(
    courses: &Vec<Vec<Section>>,
    index: usize,
    current: &mut Vec<Section>,
    results: &mut Vec<Vec<Section>>,
) {
    if index == courses.len() {
        results.push(current.clone());
        return;
    }

    let course_sections = &courses[index];

    for section in course_sections {
        if can_add_section(current, section) {
            current.push(section.clone());

            backtrack(courses, index + 1, current, results);

            current.pop();
        }
    }
}

fn can_add_section(current: &Vec<Section>, candidate: &Section) -> bool {
    for existing in current {
        if sections_conflict(existing, candidate) {
            return false;
        }
    }
    true
}

//
// =========================
// CONFLICT DETECTION
// =========================
//

pub fn sections_conflict(a: &Section, b: &Section) -> bool {
    for ba in &a.blocks {
        if ba.start_min == ba.end_min && ba.start_min == 0 {
            continue;
        }

        for bb in &b.blocks {
            if bb.start_min == bb.end_min && bb.start_min == 0 {
                continue;
            }
            if ba.day == bb.day
                && ba.start_min < bb.end_min + 15
                && bb.start_min < ba.end_min + 15
            {
                return true;
            }
        }
    }
    false
}

//
// =========================
// JSON EXPORT
// =========================
//

fn schedules_to_json(schedules: Vec<Vec<Section>>) -> String {
    let output: Vec<Schedule> = schedules
        .into_iter()
        .map(|sched| Schedule {
            sections: sched,
        })
        .collect();

    serde_json::to_string(&output).unwrap()
}

//
// =========================
// MEETING PARSER
// =========================
//

pub fn parse_meeting_times(
    input: &str,
    class_section: &str,
    instructor: &str,
    room_entry: &RoomEntry,
) -> Option<MeetingPattern> {
    let input = input.trim();

    if input.is_empty() || input.contains("ARRANGED") {
        return None;
    }

    let chunks: Vec<&str> = input.split(" & ").collect();

    let mut blocks = Vec::new();

    for chunk in chunks {
        if let Some(mut parsed) =
            parse_single_meeting(chunk, class_section, instructor, room_entry)
        {
            blocks.append(&mut parsed);
        }
    }

    if blocks.is_empty() {
        None
    } else {
        Some(MeetingPattern { blocks })
    }
}

fn parse_single_meeting(
    input: &str,
    class_section: &str,
    instructor: &str,
    room_entry: &RoomEntry,
) -> Option<Vec<Block>> {
    let parts: Vec<&str> = input.split('/').map(|s| s.trim()).collect();

    if parts.len() < 2 {
        return None;
    }

    let time_part = parts[0];
    let days_part = parts[1];

    let (start, end) = parse_time_range(time_part)?;

    if start > end {
        panic!("Invalid time range");
    }

    let days = parse_days(days_part);

    let mut blocks = Vec::new();

    for day in days {
        blocks.push(Block {
            day,
            start_min: start,
            end_min: end,

            class_section: class_section.to_string(),
            instructor: instructor.to_string(),
            room: room_entry.room.to_string(),
            registration_number: room_entry.class.to_string(),
        });
    }

    Some(blocks)
}

fn parse_time_range(input: &str) -> Option<(u16, u16)> {
    let parts: Vec<&str> = input.split('-').map(|s| s.trim()).collect();
    if parts.len() != 2 {
        return None;
    }

    Some((parse_time(parts[0])?, parse_time(parts[1])?))
}

fn parse_time(input: &str) -> Option<u16> {
    let input = input.trim().to_uppercase();

    let is_pm = input.contains("PM");
    let is_am = input.contains("AM");

    // FIXED lifetime issue
    let binding = input.replace("AM", "").replace("PM", "");
    let cleaned = binding.trim();

    let parts: Vec<&str> = cleaned.split(':').collect();
    if parts.len() != 2 {
        return None;
    }

    let hour: u16 = parts[0].parse().ok()?;
    let minute: u16 = parts[1].parse().ok()?;

    let mut hour24 = hour;

    if is_pm && hour != 12 {
        hour24 += 12;
    }

    if is_am && hour == 12 {
        hour24 = 0;
    }

    Some(hour24 * 60 + minute)
}

fn parse_days(input: &str) -> Vec<String> {
    let mut days = Vec::new();
    let mut chars = input.chars().peekable();

    while chars.peek().is_some() {
        let mut day = String::new();

        for _ in 0..2 {
            if let Some(c) = chars.next() {
                day.push(c);
            }
        }

        if day.len() == 2 && day.chars().all(|c| c.is_alphabetic()) {
            days.push(day);
        }
    }

    days
}
