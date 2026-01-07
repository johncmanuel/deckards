import { useState } from "react";
import { Lobby } from "./components/Lobby";
import "./index.css";

import logo from "./logo.svg";

export function App() {
  const [view, setView] = useState("lobby");

  return (
    <div className="max-w-7xl mx-auto p-8 text-center relative z-10">
      <div className="flex justify-center items-center gap-8 mb-6">
        <img
          src={logo}
          alt="Bun Logo"
          className="h-20 p-4 transition-all duration-300 hover:drop-shadow-[0_0_2em_#646cffaa]"
        />
      </div>

      <h1 className="text-4xl font-bold my-2 leading-tight">Deckards — Lobby</h1>

      <div className="flex justify-center gap-3 my-4">
        <button
          onClick={() => setView("lobby")}
          className={`px-4 py-2 rounded ${view === "lobby" ? "bg-[#4f46e5]" : "bg-[#111]"}`}
        >
          Lobby
        </button>
      </div>

      <div className="mt-6">
        <Lobby />
      </div>
    </div>
  );
}

export default App;
