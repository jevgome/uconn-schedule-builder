import init, { generate_schedules_from_sections, get_sections_for_courses } from "./wasm_pkg/scheduler_wasm";
import { useEffect, useState, useRef } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Course {
  code: string;
  title: string;
}

interface DraggableBlockData {
  id: string;
  name: string;
}

interface BlockProps {
  id: string;
  name: string;
  onDelete: (id: string) => void;
}
function DraggableBlock({ id, name, onDelete }: BlockProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.9 : 1,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`group relative bg-blue-950 text-white rounded-2xl p-4 m-2 w-64 shadow-lg cursor-grab active:cursor-grabbing select-none ${
        isDragging 
          ? 'shadow-2xl scale-110 rotate-3 z-50' 
          : 'hover:shadow-2xl hover:scale-105 hover:-rotate-1'
      }`}
      onMouseEnter={(e) => {
        if (!isDragging) {
          const btn = e.currentTarget.querySelector("button");
          if (btn) (btn as HTMLButtonElement).style.opacity = "1";
          e.currentTarget.style.boxShadow = "0 25px 50px rgba(99, 102, 241, 0.4), 0 0 30px rgba(139, 92, 246, 0.3)";
        }
      }}
      onMouseLeave={(e) => {
        const btn = e.currentTarget.querySelector("button");
        if (btn) (btn as HTMLButtonElement).style.opacity = "0";
        if (!isDragging) {
          e.currentTarget.style.boxShadow = "0 10px 25px rgba(0, 0, 0, 0.1)";
        }
      }}
    >
      <div className="relative z-10 font-semibold text-center text-lg tracking-wide">
        {name}
      </div>
      <button
        className="absolute -top-3 -right-3 w-7 h-7 bg-red-600 hover:bg-red-700 cursor-pointer text-white rounded-full opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center text-sm font-bold shadow-lg transform hover:scale-110 hover:rotate-90"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(id);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      >
        ×
      </button>
    </div>
  );
}

export default function App() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<DraggableBlockData[]>([]);
  const [classesDataRaw, setClassesDataRaw] = useState<any[]>([]);
  const [selectedSemester, setSelectedSemester] = useState<string>('');
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<Course[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"typing" | "suggestions">("typing");
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);

  // Scheduler call
  const runScheduler = async () => {
    if (sections.length === 0) {
      console.log("No sections available yet.");
      return;
    }

    await init();

    // =========================
    // STEP 1: GENERATE SCHEDULES
    // =========================
    const schedulesJson = generate_schedules_from_sections(sections);

    const schedules = JSON.parse(schedulesJson);
    setSchedules(schedules)

    console.log("Found schedules:", schedules.length);
    console.log("Schedules:", schedules);

    // later you will:
    // setSchedules(schedules);
  };

  useEffect(() => {
    Promise.all([
      fetch("/uconn-schedule-builder/semesters/1268/classes.json").then((res) => res.json()),
      fetch("/uconn-schedule-builder/courses.json").then((res) => res.json()),
    ])
      .then(([classesData, coursesData]) => {
        const titleMap = new Map<string, string>();

        for (const c of coursesData) {
          const key = `${c.course} ${c.catalog_number}`;
          titleMap.set(key, c.name);
        }

        const uiCourses: Course[] = classesData.map((c: any) => {
          const code = `${c.subject} ${c.catalog_number}`;

          return {
            code,
            title: titleMap.get(code) ?? "Unknown Course",
          };
        });

        setCourses(uiCourses);
        setClassesDataRaw(classesData);
      })
      .catch((err) => console.error("Error loading courses:", err));
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSuggestions([]);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (!input.trim() || input.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    
    const query = input.toLowerCase().trim();
    const filtered = courses
      .filter((course) => {
        const fullName = course.code.toLowerCase();
        const courseName = (course.title ?? "").toLowerCase();
        return fullName.includes(query) || 
               courseName.includes(query);
      })
      .reduce((unique, course) => {
        if(!unique.find(c=>c.code === course.code)) {
          unique.push(course);
        }
        return unique;
      }, [] as Course[])
      .slice(0, 8);
    setSuggestions(filtered);
  }, [input, courses]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger on "i"
      if (e.key !== "i") return;

      // Ignore if modifier keys are pressed
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Only run on desktop (basic mobile detection)
      const isMobile =
        /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(
          navigator.userAgent
        );

      if (isMobile) return;

      // Don't trigger if user is already typing
      const active = document.activeElement;
      const isTyping =
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          (active as HTMLElement).isContentEditable);

      if (isTyping) return;

      e.preventDefault();

      searchInputRef.current?.focus();
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isTyping =
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          (active as HTMLElement).isContentEditable);

      // ESC → exit suggestion mode / blur input
      if (e.key === "Escape") {
        setMode("typing");
        setSelectedSuggestion(0);
        searchInputRef.current?.blur();
        return;
      }

      // i → focus search
      if (e.key === "i") {
        const isMobile =
          /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(
            navigator.userAgent
          );

        if (isMobile) return;

        setMode("typing");
        searchInputRef.current?.focus();
        return;
      }

      // Enter suggestion mode via Tab (still only when suggestions exist)
      if (e.key === "Tab") {
        const active = document.activeElement;

        const isSearchFocused =
          searchInputRef.current &&
          active === searchInputRef.current;

        if (!isSearchFocused) return;

        if (suggestions.length === 0) return;

        e.preventDefault();
        setMode("suggestions");
        setSelectedSuggestion(0);
        return;
      }
      // =========================
      // ARROW NAVIGATION (ALWAYS)
      // =========================
      if (e.key === "ArrowDown") {
        e.preventDefault();

        if (suggestions.length === 0) return;

        setSelectedSuggestion((prev) =>
          Math.min(prev + 1, suggestions.length - 1)
        );

        if (mode === "typing") setMode("suggestions");
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();

        if (suggestions.length === 0) return;

        setSelectedSuggestion((prev) => Math.max(prev - 1, 0));

        if (mode === "typing") setMode("suggestions");
        return;
      }

      // =========================
      // VIM KEYS (ONLY suggestion mode)
      // =========================
      if (mode === "suggestions") {
        if (e.key === "j") {
          e.preventDefault();
          setSelectedSuggestion((prev) =>
            Math.min(prev + 1, suggestions.length - 1)
          );
        }

        if (e.key === "k") {
          e.preventDefault();
          setSelectedSuggestion((prev) =>
            Math.max(prev - 1, 0)
          );
        }

        if (e.key === "Enter") {
          const course = suggestions[selectedSuggestion];
          if (!course) return;

          const already = blocks.some(
            (b) => b.name === course.code
          );

          if (!already) addBlock(course);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode, suggestions, selectedSuggestion, blocks]);
  useEffect(() => {
    setMode("typing");
    setSelectedSuggestion(0);
  }, [input]);


  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 3,
      },
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((block) => block.id === active.id);
      const newIndex = blocks.findIndex((block) => block.id === over.id);
      setBlocks(arrayMove(blocks, oldIndex, newIndex));
    }
  };

  const addBlock = async (course: Course) => {
    const courseName = course.code;

    if (blocks.some(block => block.name === courseName)) {
      return;
    }

    const newBlocks = [
      ...blocks,
      {
        id: `${course.code}-${Date.now()}`,
        name: courseName,
      },
    ];

    setBlocks(newBlocks);

    // =========================
    // NEW: IMMEDIATE SECTION FETCH
    // =========================
    await init();

    const selectedCodes = newBlocks.map(b => b.name);

    const sectionsJson = get_sections_for_courses(
      selectedCodes,
      classesDataRaw
    );

    const sections = JSON.parse(sectionsJson);

    console.log("Updated Sections:", sections);

    setSections(sections);
    setInput("");
    setSuggestions([]);
  };

  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((block) => block.id !== id));
  };

  const handleInputSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && suggestions.length > 0) {
      e.preventDefault();

      const firstAvailable = suggestions.find(
        (course) => !blocks.some((block) => block.name === course.code)
      );

      if (firstAvailable) addBlock(firstAvailable);
    }

    if (e.key === "Tab") {
      if (suggestions.length === 0) return;

      e.preventDefault();
      setMode("suggestions");
      setSelectedSuggestion(0);
    }
  };

  const highlightMatch = (text: string, query: string) => {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);
    
    if (index === -1) return text;
    
    return (
      <>
        {text.slice(0, index)}
        <span style={{ backgroundColor: "yellow", fontWeight: "bold" }}>
          {text.slice(index, index + query.length)}
        </span>
        {text.slice(index + query.length)}
      </>
    );
  };

  return (
    <div className="h-screen flex bg-gray-100">

      {/* LEFT SIDEBAR */}
      <div className="w-[300px] bg-gradient-to-br from-slate-50 to-blue-50 shadow-2xl z-10 flex flex-col overflow-hidden border-r border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">
            UConn Schedule Builder
          </h1>
          <p className="text-gray-600 text-sm">
            Search and organize your courses
          </p>
        </div>

        {/* Search */}
        <div className="p-6">
          <div ref={searchRef} className="relative">
            <input
              ref={searchInputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputSubmit}
              placeholder="🔍 Search catalog # or title..."
              className="w-full px-4 py-3 text-base border-0 rounded-xl bg-white shadow-lg focus:shadow-xl focus:outline-none transition-all duration-300 ring-2 ring-transparent focus:ring-indigo-300 focus:ring-4"
              style={{
                background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                boxShadow: '0 8px 20px rgba(79, 70, 229, 0.15), 0 4px 8px rgba(0, 0, 0, 0.1)',
              }}
            />
            {/* Suggestions Dropdown */}
            {suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl z-50 border p-3">
                {suggestions.map((course, index) => {
                  const isAlreadyAdded = blocks.some(
                    (block) => block.name === course.code
                  );

                  const isSelected = index == selectedSuggestion;

                  return (
                    <button
                      key={index}
                      className={`w-full text-left p-3 rounded-lg border text-sm transition-all duration-200 ${
                        isAlreadyAdded
                          ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                          : isSelected
                            ? "bg-indigo-100 border-indigo-500 shadow-md"
                            : "bg-white text-gray-700 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-400"
                      }`}
                      onClick={() => !isAlreadyAdded && addBlock(course)}
                      disabled={isAlreadyAdded}
                    >
                      <div className="font-semibold">
                        {course.code}
                      </div>
                      <div className="text-xs mt-1">
                        {course.title}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Generate button */}
        <div className="px-6">
          <button
            type="button"
            onClick={() => runScheduler()}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-xl shadow-lg"
          >
            Generate Schedules
          </button>
        </div>
      </div>

      {/* CENTER */}
      <div className="flex-1 p-8 bg-white z-0">
        <div className="h-full flex items-center justify-center">
          <div className="text-center">
            <div className="text-8xl mb-6">🎓</div>
            <h2 className="text-3xl font-bold mb-4">
              Welcome to Schedule Builder
            </h2>
            <p className="text-gray-600">
              Use the sidebars to build your schedule
            </p>
          </div>
        </div>
      </div>

      {/* RIGHT SIDEBAR */}
      <div className="w-[300px] bg-gradient-to-br from-slate-50 to-blue-50 shadow-2xl z-10 flex flex-col overflow-y-auto p-6 border-l border-gray-200">
        <h2 className="text-lg font-semibold mb-4">
          Your Schedule ({blocks.length})
        </h2>

        {blocks.length === 0 ? (
          <div className="text-center text-gray-500 mt-10">
            📚 No courses added yet
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={blocks.map((b) => b.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col items-center">
                {blocks.map((block) => (
                  <DraggableBlock
                    key={block.id}
                    id={block.id}
                    name={block.name}
                    onDelete={removeBlock}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

    </div>
  );
}
