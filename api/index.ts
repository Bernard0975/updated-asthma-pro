import express from 'express';
import api from '../src/api';

const app = express();

app.use(express.json());

// Primary mount for normal /api/* requests.
app.use('/api', api);
// Fallback mount for platforms that forward a stripped URL path.
app.use(api);

export default app;
