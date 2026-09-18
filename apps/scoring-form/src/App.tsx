import './App.css';
import { ScoringForm } from './components/ScoringForm';
import { ViewerFrame } from './components/ViewerFrame';

function App() {
  return (
    <main className="app">
      <ViewerFrame />
      <ScoringForm />
    </main>
  );
}

export default App;
