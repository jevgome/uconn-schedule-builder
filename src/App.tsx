import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Draggable block component
interface BlockProps {
  id: string;
  name: string;
}

function DraggableBlock({
  id,
  name,
  onDelete,
}: BlockProps & { onDelete: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style: React.CSSProperties = {
    position: "relative",
    transform: CSS.Transform.toString(transform),
    transition,
    padding: "12px 20px",
    margin: "6px 0",
    background: "#4f46e5",
    color: "white",
    borderRadius: "0.5rem",
    width: 200,
    cursor: "grab",
    textAlign: "center",
    overflow: "visible", // so the button outside is visible
  };

  const buttonStyle: React.CSSProperties = {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: "50%",
    backgroundColor: "#ef4444",
    color: "white",
    border: "none",
    fontWeight: "bold",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    lineHeight: 1,
    pointerEvents: "auto",
    opacity: 0, // hidden by default
    transition: "opacity 0.2s",
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onMouseEnter={(e) => {
        const btn = e.currentTarget.querySelector("button");
        if (btn) (btn as HTMLButtonElement).style.opacity = "1";
      }}
      onMouseLeave={(e) => {
        const btn = e.currentTarget.querySelector("button");
        if (btn) (btn as HTMLButtonElement).style.opacity = "0";
      }}
    >
      {name}
      <button
        style={buttonStyle}
        onClick={() => onDelete(id)}
        onPointerDown={(e) => e.stopPropagation()} // prevent drag
      >
        ×
      </button>
    </div>
  );
}

// Main App
export default function App() {
  const [blocks, setBlocks] = useState<BlockProps[]>([
    { id: "1", name: "Math 101" },
    { id: "2", name: "CS 202" },
  ]);
  const [inputValue, setInputValue] = useState("");

  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event: any) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      setBlocks(arrayMove(blocks, oldIndex, newIndex));
    }
  }

  function addBlock() {
    if (!inputValue.trim()) return;
    const newBlock: BlockProps = {
      id: Date.now().toString(),
      name: inputValue,
    };
    setBlocks([...blocks, newBlock]);
    setInputValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") addBlock();
  }

  function deleteBlock(id: string) {
    setBlocks(blocks.filter((b) => b.id !== id));
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
        background: "#f3f4f6",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          padding: "1rem",
          borderRadius: "0.5rem",
          background: "#fff",
          boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
        }}
      >
        <h1 style={{ textAlign: "center", marginBottom: "1rem" }}>Drag & Drop Courses</h1>

        {/* Input */}
        <div style={{ display: "flex", marginBottom: "1rem" }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a course..."
            style={{
              flex: 1,
              padding: "8px",
              borderRadius: "4px",
              border: "1px solid #ccc",
              marginRight: "8px",
            }}
          />
          <button
            onClick={addBlock}
            style={{
              padding: "8px 12px",
              borderRadius: "4px",
              border: "none",
              background: "#4f46e5",
              color: "white",
              cursor: "pointer",
            }}
          >
            Add
          </button>
        </div>

        {/* Draggable list */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              {blocks.map((block) => (
                <DraggableBlock
                  key={block.id}
                  id={block.id}
                  name={block.name}
                  onDelete={deleteBlock}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}
