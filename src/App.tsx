import { useKeyboardFSM } from "./hooks/useKeyboardFSM";
import init, { generate_schedules_from_sections, get_sections_for_courses } from "./wasm_pkg/scheduler_wasm";
import { useEffect, useState, useRef, useCallback } from "react";
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
  code: string;
  title: string;
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
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  type FocusContext = "global" | "search" | "suggestions" | "blocks";
  const [focusContext, setFocusContext] = useState<FocusContext>("global");
  const [hasMovedSelection, setHasMovedSelection] = useState(false);

  const addBlock = async (course: Course) => {
    const courseName = course.code;

    if (blocks.some(block => block.code === courseName)) {
      return;
    }


    const newBlocks = [
      ...blocks,
      {
        id: `${course.code}-${Date.now()}`,
        code: course.code,
        title: course.title,
      },
    ];
    setBlocks(newBlocks);

    // =========================
    // NEW: IMMEDIATE SECTION FETCH
    // =========================
    await init();

    const selectedCodes = newBlocks.map(b => b.code);

    const sectionsJson = get_sections_for_courses(
      selectedCodes,
      classesDataRaw
    );

    const sections = JSON.parse(sectionsJson);

    console.log("Updated Sections:", sections);

    setSections(sections);
    setInput("");
    setSuggestions([]);
    setFocusContext("search");
    setSelectedSuggestion(0);

    // optional but strongly recommended
    searchInputRef.current?.focus();
  };

  const handleEnter = useCallback(() => {
    if (suggestions.length === 0) return;

    const available = suggestions.filter(
      (c) => !blocks.some((b) => b.code === c.code)
    );

    if (available.length === 0) return;

    // clamp selection to valid range
    const index = Math.min(
      selectedSuggestion,
      available.length - 1
    );

    const course = visibleSuggestions[selectedSuggestion];

    if (!course) return;

    addBlock(course);
  }, [suggestions, blocks, selectedSuggestion, addBlock]);

  const visibleSuggestions = suggestions.filter(
    (c) => !blocks.some((b) => b.code === c.code)
  );

  const effectiveSelectedSuggestion =
    focusContext === "search"
      ? 0
      : selectedSuggestion;

  const fsm = {
    global: {
      i: {
        next: "search",
        action: (_, ctx) => {
          ctx.searchInputRef.current?.focus();
        },
      },
    },

    search: {
      Enter: {
        action: (_, ctx) => ctx.handleEnter(),
      },

      ArrowDown: {
        next: "suggestions",
        action: (_, ctx) => {
          ctx.setHasMovedSelection(true);
          ctx.setSelectedSuggestion(
            Math.min(1, ctx.visibleSuggestions.length - 1)
          );
        },
      },

      Tab: {
        next: "suggestions",
        action: (_, ctx) => {
          ctx.setSelectedSuggestion(
            Math.min(0, ctx.visibleSuggestions.length - 1)
          );
        },
      },
    },

    suggestions: {
      Enter: {
        action: (_, ctx) => ctx.handleEnter(),
      },

      Escape: {
        next: "search",
        action: (_, ctx) => {
          ctx.searchInputRef.current?.focus();
        },
      },

      j: {
        action: (_, ctx) => {
          ctx.setHasMovedSelection(true);
          ctx.setSelectedSuggestion((p: number) =>
            Math.min(p + 1, ctx.visibleSuggestions.length - 1)
  );
        },
      },

      k: {
        action: (_, ctx) => {
          ctx.setHasMovedSelection(true);
          ctx.setSelectedSuggestion((p: number) =>
            Math.max(p - 1, 0)
          );
        },
      },

      ArrowDown: {
        action: (_, ctx) => {
          ctx.setHasMovedSelection(true);
          ctx.setSelectedSuggestion((p: number) =>
            Math.min(p + 1, ctx.visibleSuggestions.length - 1)
          );
        },
      },

      ArrowUp: {
        action: (_, ctx) => {
          ctx.setHasMovedSelection(true);
          ctx.setSelectedSuggestion((p: number) =>
            Math.max(p - 1, 0)
          );
        },
      },
    },
  };

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



  const scoreCourse = (course: Course, query: string) => {
    const q = query.toLowerCase().trim();
    const code = course.code.toLowerCase();
    const title = course.title.toLowerCase();

    let score = 0;

    // exact match = highest priority
    if (code === q) score += 100;

    // prefix match (very strong)
    if (code.startsWith(q)) score += 50;

    // includes match
    if (code.includes(q)) score += 30;
    if (title.includes(q)) score += 10;

    // bonus: closer position match
    const codeIndex = code.indexOf(q);
    if (codeIndex === 0) score += 20;

    return score;
  };

  const getGhostText = () => {
    if (!input.trim()) return "";

    const query = input.toLowerCase().trim();

    const baseCourse =
      focusContext === "suggestions"
        ? visibleSuggestions[selectedSuggestion]
        : visibleSuggestions[0];

    if (!baseCourse) return "";

    const code = baseCourse.code;

    if (!code.toLowerCase().startsWith(query)) return "";

    const normalizedInput = input.replace(/\s+$/, " ");

    if (!code.toLowerCase().startsWith(normalizedInput.toLowerCase())) {
      return "";
    }

    return code.slice(normalizedInput.length);
  };

  const getEnterCandidate = (): Course | undefined => {
    if (suggestions.length === 0) return undefined;

    return suggestions.find(
      (c) => !blocks.some((b) => b.code === c.code)
    );
  };

  useKeyboardFSM({
    state: focusContext,
    setState: setFocusContext,

    inputRef: searchInputRef,

    getContext: () => ({
      visibleSuggestions,
      suggestions,
      blocks,
      selectedSuggestion,
      setSelectedSuggestion,
      setSuggestions,
      handleEnter,
      searchInputRef,
      hasMovedSelection,
      setHasMovedSelection,
    }),

    fsm,
  });

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

        const courseMap = new Map<string, Course>();

        for (const c of classesData) {
          const code = `${c.subject} ${c.catalog_number}`;

          if (!courseMap.has(code)) {
            courseMap.set(code, {
              code,
              title: titleMap.get(code) ?? "Unknown Course",
            });
          }
        }

        const uiCourses = Array.from(courseMap.values());

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
    setHasMovedSelection(false);
    setSelectedSuggestion(0);
  }, [input]);

  useEffect(() => {
    if (!input.trim() || input.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const query = input.toLowerCase().trim();

    const ranked = courses
      .map((course) => ({
        course,
        score: scoreCourse(course, query),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((item) => item.course);

    setSuggestions(ranked);
  }, [input, courses]);

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

  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((block) => block.id !== id));
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


  const goGlobal = () => {
    setFocusContext("global");
    setSelectedSuggestion(0);
    searchInputRef.current?.blur();
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

            {/* INPUT */}
            <input
              ref={searchInputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full px-4 py-3 text-base bg-white border border-gray-300 rounded-xl shadow-md
                         focus:outline-none focus:ring-2 focus:ring-indigo-500 relative z-10"
              placeholder="Search catalog # or title..."
              onFocus={() => setFocusContext("search")}
              onBlur={(e) => {
                // delay so click on suggestion doesn't instantly kill state
                setTimeout(() => {
                  const active = document.activeElement;
                  if (active !== searchInputRef.current) {
                    setFocusContext("global");
                  }
                }, 0);
              }}
            />

            {/* GHOST LAYER */}
            {getGhostText() && (
              <div className="absolute inset-0 flex items-center px-4 py-3 pointer-events-none text-base z-20">
                
                {/* invisible input text to push cursor position */}
                <span className="text-transparent whitespace-pre">
                  {input}
                </span>

                {/* ghost completion */}
                <span className="text-gray-400 whitespace-pre">
                  {getGhostText()}
                </span>

              </div>
            )}

            {/* Suggestions Dropdown */}
            {focusContext != "global" && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl z-50 border p-3">
                {visibleSuggestions.map((course, index) => {
                  const candidate = getEnterCandidate();

                  const isSelected =
                    hasMovedSelection
                      ? index === selectedSuggestion
                      : index === 0;


                  return (
                    <button
                      key={index}

                      className={`w-full text-left p-3 rounded-lg border text-sm transition-all duration-200
                        ${
                           isSelected
                                ? "bg-indigo-100 border-indigo-500 shadow-md"
                                : "bg-white text-gray-700 border-indigo-200 hover:bg-indigo-50"
                        }
                      `}
                      onClick={() => addBlock(course)}
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
      <div 
        className="w-[300px] bg-gradient-to-br from-slate-50 to-blue-50 shadow-2xl z-10 flex flex-col overflow-y-auto p-6 border-l border-gray-200"
        onClick={() => setFocusContext("blocks")}
      >
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
                    name={block.code}
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
