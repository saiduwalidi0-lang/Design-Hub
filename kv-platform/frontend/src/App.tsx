import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import KVDetailPage from './pages/KVDetailPage';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/kv/:id" element={<KVDetailPage />} />
          <Route path="*" element={<div className="p-8 text-center">Under Construction</div>} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
