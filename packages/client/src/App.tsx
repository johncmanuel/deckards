import { Lobby } from "./components/Lobby";
import "./index.css";

import logo from "./logo.svg";

export function App() {
  return (
    <div className="max-w-7xl mx-auto p-8 text-center relative z-10">
      <div className="flex justify-center items-center gap-8 mb-6">
        <img
          src={logo}
          alt="Bun Logo"
          className="h-20 p-4 transition-all duration-300 hover:drop-shadow-[0_0_2em_#646cffaa]"
        />
      </div>

      <h1 className="text-4xl font-bold my-2 leading-tight">Deckards</h1>

        <div className="mt-6">
        <Lobby />
      </div>
    </div>
  );
}

export default App;
