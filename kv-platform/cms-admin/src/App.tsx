import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import KVListPage from './pages/KVListPage';
import KVEditPage from './pages/KVEditPage';
import BatchImportPage from './pages/BatchImportPage';
import FigmaCrawlPage from './pages/FigmaCrawlPage';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<KVListPage />} />
          <Route path="/edit/:id" element={<KVEditPage />} />
          <Route path="/create" element={<KVEditPage />} />
          <Route path="/batch-import" element={<BatchImportPage />} />
          <Route path="/figma-crawl" element={<FigmaCrawlPage />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
