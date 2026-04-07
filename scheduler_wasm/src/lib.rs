// wasm-pack build --target web --out-dir ../src/wasm_pkg
use wasm_bindgen::prelude::*;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json;
use serde_wasm_bindgen::to_value;

// Custom deserializer for handling null values as default
fn deserialize_null_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: Deserializer<'de>,
    T: Default + Deserialize<'de>,
{
    let opt = Option::deserialize(deserializer)?;
    Ok(opt.unwrap_or_default())
}

// Hook better panic messages in the browser console
#[wasm_bindgen(start)]
pub fn main_js() {
    console_error_panic_hook::set_once();
}

// Meeting times for each section
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MeetingTime {
    pub meet_day: String,
    pub start_time: String,
    pub end_time: String,
}

impl MeetingTime {
    pub fn normalized_day(&self) -> u8 {
        match self.meet_day.parse::<u8>() {
            Ok(day) => day,
            Err(_) => 0,
        }
    }
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console)]
    fn log(s: &str);
}

// Representation of a course section
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Section {
    pub semester: String,
    pub code: String,
    pub crn: String,
    pub title: String,
    pub no: String,
    #[serde(deserialize_with = "deserialize_null_default")]
    pub is_open: u8,
    pub meeting_times: String,
    pub career: String,
    #[serde(default)]
    pub linked_crns: String,
    #[serde(default)]
    pub is_enroll_section: String,
    #[serde(deserialize_with = "deserialize_null_default")]
    pub max_enroll: u32,
    #[serde(deserialize_with = "deserialize_null_default")]
    pub seats_available: u32,
    pub schd: String,
    pub campus: String,
    pub inst_mode: String,
    #[serde(default)]
    pub requirements: String,
    #[serde(default)]
    pub reserved_seats: String,
    pub session: String,
    pub num_credits: String,
    pub description: String,
    #[serde(default)]
    pub attributes: Vec<String>
}

impl Section {
    pub fn get_meeting_times(&self) -> Vec<MeetingTime> {
        serde_json::from_str(&self.meeting_times).unwrap_or_default()
    }
    
    pub fn conflicts_with(&self, other: &Section) -> bool {
        let my_times = self.get_meeting_times();
        let other_times = other.get_meeting_times();
        
        for my_time in &my_times {
            for other_time in &other_times {
                if my_time.normalized_day() == other_time.normalized_day() {
                    let my_start: u32 = my_time.start_time.parse().unwrap_or(0);
                    let my_end: u32 = my_time.end_time.parse().unwrap_or(0);
                    let other_start: u32 = other_time.start_time.parse().unwrap_or(0);
                    let other_end: u32 = other_time.end_time.parse().unwrap_or(0);
                    
                    if my_start < other_end && my_end > other_start {
                        return true;
                    }
                }
            }
        }
        false
    }
}

// A generated schedule = list of sections
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Schedule {
    pub sections: Vec<Section>,
}

#[wasm_bindgen]
pub fn generate_schedules_from_sections(
    dataset_json: &str,
    selected_json: &str,
    max_results: usize,
) -> JsValue {
    // Parse dataset
    let dataset: Vec<Section> = match serde_json::from_str(dataset_json) {
        Ok(data) => data,
        Err(e) => {
            log(&format!("Error parsing dataset: {}", e));
            return to_value(&Vec::<Schedule>::new()).unwrap();
        }
    };
    
    let selected: Vec<String> = match serde_json::from_str(selected_json) {
        Ok(data) => data,
        Err(e) => {
            log(&format!("Error parsing selected courses: {}", e));
            return to_value(&Vec::<Schedule>::new()).unwrap();
        }
    };

    log(&format!("Dataset size: {}", dataset.len()));
    log(&format!("Selected courses: {:?}", selected));

    // Group sections by course code - keep them separate for each unique course
    let mut courses: Vec<Vec<Section>> = Vec::new();
    
    for selected_course in &selected {
        let matching_sections: Vec<Section> = dataset
            .iter()
            .filter(|section| {
                selected_course == &section.code ||
                section.code.starts_with(selected_course) ||
                selected_course.to_lowercase() == section.code.to_lowercase()
            })
            .cloned()
            .collect();
        
        if !matching_sections.is_empty() {
            log(&format!("Found {} sections for course '{}'", matching_sections.len(), selected_course));
            courses.push(matching_sections);
        } else {
            log(&format!("No sections found for course '{}'", selected_course));
        }
    }

    if courses.is_empty() {
        log("No matching courses found. Check that your selected course codes match the dataset format.");
        return to_value(&Vec::<Schedule>::new()).unwrap();
    }

    log(&format!("Generating schedules from {} courses", courses.len()));

    // Generate all valid schedule combinations
    let mut results: Vec<Schedule> = Vec::new();
    let mut current_schedule: Vec<Section> = Vec::new();
    
    generate_combinations(&courses, &mut current_schedule, 0, &mut results, max_results);

    log(&format!("Generated {} valid schedules", results.len()));
    to_value(&results).unwrap()
}

// Recursive function to generate all valid schedule combinations
fn generate_combinations(
    courses: &[Vec<Section>],
    current_schedule: &mut Vec<Section>,
    course_index: usize,
    results: &mut Vec<Schedule>,
    max_results: usize,
) {
    // Stop if we've hit the max results limit
    if results.len() >= max_results {
        return;
    }
    
    // Base case: we've selected one section from each course
    if course_index >= courses.len() {
        // Add this valid schedule to results
        results.push(Schedule {
            sections: current_schedule.clone(),
        });
        return;
    }
    
    // Try each section from the current course
    for section in &courses[course_index] {
        // Check if this section conflicts with any section already in the schedule
        let mut has_conflict = false;
        for existing_section in current_schedule.iter() {
            if section.conflicts_with(existing_section) {
                has_conflict = true;
                break;
            }
        }
        
        // If no conflict, add this section and recurse to next course
        if !has_conflict {
            current_schedule.push(section.clone());
            generate_combinations(courses, current_schedule, course_index + 1, results, max_results);
            current_schedule.pop();
            
            // Early exit if we've hit max results
            if results.len() >= max_results {
                return;
            }
        }
    }
}
