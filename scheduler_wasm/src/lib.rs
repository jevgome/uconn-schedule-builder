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
    pub meet_day: String,   // Changed to String to match your data format
    pub start_time: String, // e.g. "1230"
    pub end_time: String,   // e.g. "1345"
}

impl MeetingTime {
    pub fn normalized_day(&self) -> u8 {
        // Convert string day to number, then normalize
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
    pub meeting_times: String, // stored as JSON string, needs parsing
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
    // Helper method to parse meeting times from JSON string
    pub fn get_meeting_times(&self) -> Vec<MeetingTime> {
        serde_json::from_str(&self.meeting_times).unwrap_or_default()
    }
    
    // Helper method to get course prefix (e.g., "AAAS" from "AAAS 1001")
    pub fn get_course_prefix(&self) -> String {
        self.code.split_whitespace().next().unwrap_or("").to_string()
    }
    
    // Helper method to check if this section conflicts with another
    pub fn conflicts_with(&self, other: &Section) -> bool {
        let my_times = self.get_meeting_times();
        let other_times = other.get_meeting_times();
        
        for my_time in &my_times {
            for other_time in &other_times {
                if my_time.normalized_day() == other_time.normalized_day() {
                    // Check for time overlap
                    let my_start: u32 = my_time.start_time.parse().unwrap_or(0);
                    let my_end: u32 = my_time.end_time.parse().unwrap_or(0);
                    let other_start: u32 = other_time.start_time.parse().unwrap_or(0);
                    let other_end: u32 = other_time.end_time.parse().unwrap_or(0);
                    
                    // Check if times overlap
                    if (my_start < other_end && my_end > other_start) {
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

impl Schedule {
    // Check if adding a section would create conflicts
    pub fn would_conflict(&self, section: &Section) -> bool {
        for existing in &self.sections {
            if existing.conflicts_with(section) {
                return true;
            }
        }
        false
    }
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
    
    if !dataset.is_empty() {
        log(&format!("Sample course code from dataset: '{}'", dataset[0].code));
    }

    // Group sections by course code
    let mut courses_sections: std::collections::HashMap<String, Vec<Section>> = 
        std::collections::HashMap::new();
    
    for section in dataset {
        let course_code = section.code.clone();
        
        // Check if this course is selected using multiple matching strategies
        let is_selected = selected.iter().any(|selected_code| {
            // Exact match
            selected_code == &course_code ||
            // Prefix match (e.g., "AAAS" matches "AAAS 1001")
            course_code.starts_with(selected_code) ||
            // Case-insensitive match
            selected_code.to_lowercase() == course_code.to_lowercase() ||
            // Remove spaces and compare
            selected_code.replace(" ", "") == course_code.replace(" ", "")
        });
        
        if is_selected {
            log(&format!("Found matching section: {}", course_code));
            courses_sections.entry(course_code).or_insert_with(Vec::new).push(section);
        }
    }

    log(&format!("Found {} matching courses", courses_sections.len()));

    // If no matching courses found, return empty result with debug info
    if courses_sections.is_empty() {
        log("No matching courses found. Check that your selected course codes match the dataset format.");
        return to_value(&Vec::<Schedule>::new()).unwrap();
    }

    // Generate all possible schedule combinations
    let mut results: Vec<Schedule> = Vec::new();
    
    // For now, let's start simple - just return individual sections as schedules
    // Later we can implement full combinatorial generation
    for (course_code, sections) in courses_sections {
        for section in sections {
            if results.len() >= max_results {
                break;
            }
            
            results.push(Schedule {
                sections: vec![section],
            });
        }
        
        if results.len() >= max_results {
            break;
        }
    }

    log(&format!("Generated {} schedules", results.len()));
    to_value(&results).unwrap()
}

// Helper function to generate full combinatorial schedules
#[wasm_bindgen]
pub fn generate_full_schedules(
    dataset_json: &str,
    selected_json: &str,
    max_results: usize,
) -> JsValue {
    // Parse inputs
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

    // Group sections by course
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
            courses.push(matching_sections);
        }
    }

    // Generate all combinations
    let mut results: Vec<Schedule> = Vec::new();
    generate_combinations(&courses, &mut Vec::new(), 0, &mut results, max_results);

    log(&format!("Generated {} complete schedules", results.len()));
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
    if results.len() >= max_results {
        return;
    }
    
    if course_index >= courses.len() {
        // We've selected a section from each course, check for conflicts
        let schedule = Schedule { sections: current_schedule.clone() };
        
        // Check if schedule has no conflicts
        let mut has_conflicts = false;
        for i in 0..current_schedule.len() {
            for j in (i + 1)..current_schedule.len() {
                if current_schedule[i].conflicts_with(&current_schedule[j]) {
                    has_conflicts = true;
                    break;
                }
            }
            if has_conflicts {
                break;
            }
        }
        
        if !has_conflicts {
            results.push(schedule);
        }
        return;
    }
    
    // Try each section for the current course
    for section in &courses[course_index] {
        // Check if this section conflicts with current schedule
        let temp_schedule = Schedule { sections: current_schedule.clone() };
        if !temp_schedule.would_conflict(section) {
            current_schedule.push(section.clone());
            generate_combinations(courses, current_schedule, course_index + 1, results, max_results);
            current_schedule.pop();
        }
    }
}
