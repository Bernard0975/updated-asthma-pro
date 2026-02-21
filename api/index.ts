import express from 'express';
import api from '../src/api';

const app = express();

app.use(express.json());

// Mount the API router at /api so it matches the paths like /api/weather
app.use('/api', api);

export default app;
