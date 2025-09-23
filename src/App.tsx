import { useEffect, useState } from "react";

type Course = {
  code: string;
  section: string;
  days: string[];
  start: string;
  end: string;
};

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function App() {
  const [courses, setCourses] = useState<Course[]>([]);

  useEffect(() => {
    fetch("/courses.json")
      .then((res) => res.json())
      .then(setCourses)
      .catch(console.error);
  }, []);

  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1>Schedule Builder Demo</h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "8px",
          marginTop: "2rem",
        }}
      >
        {daysOfWeek.map((day) => (
          <div
            key={day}
            style={{
              border: "1px solid #ccc",
              minHeight: "200px",
              padding: "4px",
            }}
          >
            <h3>{day}</h3>
            {courses
              .filter((c) => c.days.includes(day))
              .map((c) => (
                <div
                  key={c.code + c.section}
                  style={{
                    backgroundColor: "#4ade80",
                    margin: "2px 0",
                    padding: "4px",
                    borderRadius: "4px",
                    color: "#000",
                  }}
                >
                  {c.code} ({c.section}) <br />
                  {c.start} - {c.end}
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
