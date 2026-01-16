interface AnimatedLobbyBackgroundProps {
  numCards?: number;
}

const AnimatedLobbyBackground = ({ numCards = 20 }: AnimatedLobbyBackgroundProps) => {
  // i only like the joker card lol
  const cards = ["🃏"];
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {[...Array(numCards)].map((_, i) => (
        <div
          key={i}
          className="absolute text-4xl animate-float-card"
          style={{
            left: `${(i * 13) % 100}%`,
            animationDelay: `${-i * 1.5}s`,
            animationDuration: `${8 + (i % 5) * 2}s`,
          }}
        >
          {cards[i % cards.length]}
        </div>
      ))}
    </div>
  );
};

export default AnimatedLobbyBackground;
