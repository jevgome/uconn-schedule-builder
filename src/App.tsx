import { DndContext, closestCenter } from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";

// Component for each draggable block
function DraggableBlock({ id }: { id: string }) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: "12px",
    margin: "6px 0",
    background: "#4f46e5",
    color: "white",
    borderRadius: "0.5rem",
    textAlign: "center",
    cursor: "grab",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {id}
    </div>
  );
}

export default function App() {
  const [blocks, setBlocks] = useState(["Math", "Physics", "Chemistry"]);

  return (
    <div style={{ maxWidth: 400, margin: "2rem auto" }}>
      <h1 style={{ textAlign: "center", marginBottom: "1rem" }}>
        Drag & Drop Classes
      </h1>
      <DndContext
        collisionDetection={closestCenter}
        onDragEnd={(event) => {
          const { active, over } = event;
          if (over && active.id !== over.id) {
            const oldIndex = blocks.indexOf(active.id as string);
            const newIndex = blocks.indexOf(over.id as string);
            setBlocks(arrayMove(blocks, oldIndex, newIndex));
          }
        }}
      >
        <SortableContext items={blocks} strategy={verticalListSortingStrategy}>
          {blocks.map((block) => (
            <DraggableBlock key={block} id={block} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}

