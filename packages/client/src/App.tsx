import { Lobby } from "./components/Lobby";
import "./index.css";
import Blackjack from "./components/Blackjack";

export function App() {
  return (
    <div className="">
      {/* <h1 className="text-4xl font-bold my-2 leading-tight">Deckards</h1> */}

      {/* <div >
        <div >
          <Lobby />
        </div>
     </div> */}
      <div>
        <Blackjack />
      </div>
    </div>
  );
}

export default App;
