const { useState, useEffect, useRef } = React;

// Recreating the Lucide Icons for standalone React
const Icon = ({ name, className }) => (
  <i data-lucide={name} className={className}></i>
);

function App() {
  const [currentView, setCurrentView] = useState('menu'); // 'menu' or 'game'
  const [activeGame, setActiveGame] = useState(null);
  const [gameMode, setGameMode] = useState(null); // 'local' or 'pvai'

  const games = [
    { id: 'chess', name: 'Chess', icon: 'crown', color: 'emerald' },
    { id: 'connect4', name: 'Connect 4', icon: 'grid', color: 'cyan' },
    { id: 'tictactoe', name: 'Tic Tac Toe', icon: 'hash', color: 'amber' },
    { id: 'pool', name: '8-Ball Pool', icon: 'circle', color: 'purple' }
  ];

  const startGame = (id, mode) => {
    setActiveGame(id);
    setGameMode(mode);
    setCurrentView('game');
  };

  return (
    <div className="min-h-screen bg-slate-950 p-8 flex flex-col items-center">
      <header className="w-full max-w-4xl flex justify-between items-center mb-12">
        <h1 className="text-4xl font-black tracking-tighter bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
          ARCADE HUB
        </h1>
        {currentView === 'game' && (
          <button 
            onClick={() => setCurrentView('menu')}
            className="px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-full font-bold transition-colors"
          >
            Back to Menu
          </button>
        )}
      </header>

      {currentView === 'menu' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
          {games.map(game => (
            <div key={game.id} className="bg-slate-900 border-2 border-slate-800 rounded-2xl p-6 flex flex-col items-center">
              <Icon name={game.icon} className={`w-16 h-16 text-${game.color}-400 mb-4`} />
              <h2 className="text-2xl font-bold mb-6">{game.name}</h2>
              <div className="flex gap-4 w-full">
                <button 
                  onClick={() => startGame(game.id, 'local')}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 py-3 rounded-xl font-bold flex justify-center gap-2"
                >
                  <Icon name="users" className="w-5 h-5" /> Local 1v1
                </button>
                <button 
                  onClick={() => startGame(game.id, 'pvai')}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 py-3 rounded-xl font-bold flex justify-center gap-2"
                >
                  <Icon name="cpu" className="w-5 h-5" /> Vs AI
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="w-full max-w-4xl bg-slate-900 border-2 border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center min-h-[500px]">
           <Icon name="gamepad-2" className="w-24 h-24 text-slate-700 mb-6" />
           <h2 className="text-3xl font-bold text-slate-400 mb-2">
             {games.find(g => g.id === activeGame)?.name}
           </h2>
           <p className="text-slate-500 font-medium">
             Mode: {gameMode === 'local' ? 'Local Multiplayer' : 'Vs. Computer'}
           </p>
           <p className="text-emerald-500 mt-8 font-bold text-center">
             (Your specific game logic for Chess, Connect 4, etc., goes right here! <br/> The Firebase-free wrapper is successfully set up.)
           </p>
        </div>
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
