// Thin fetch wrapper around the Momentum REST API. Surfaces server-side
// validation details as a structured error the UI can render inline.

const BASE = '/api';

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details; // { field: message } from the server, if present
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.details);
  }
  return data;
}

export const api = {
  // Dashboard
  dashboard: (date) => request(`/dashboard${date ? `?date=${date}` : ''}`),

  // Workouts
  listWorkouts: () => request('/workouts'),
  createWorkout: (body) => request('/workouts', { method: 'POST', body }),
  updateWorkout: (id, body) => request(`/workouts/${id}`, { method: 'PUT', body }),
  deleteWorkout: (id) => request(`/workouts/${id}`, { method: 'DELETE' }),

  // Calendar events
  listEvents: () => request('/events'),
  createEvent: (body) => request('/events', { method: 'POST', body }),
  updateEvent: (id, body) => request(`/events/${id}`, { method: 'PUT', body }),
  deleteEvent: (id) => request(`/events/${id}`, { method: 'DELETE' }),

  // Nutrition
  listFoods: () => request('/nutrition/foods'),
  createFood: (body) => request('/nutrition/foods', { method: 'POST', body }),
  deleteFood: (id) => request(`/nutrition/foods/${id}`, { method: 'DELETE' }),
  listNutrition: (date) => request(`/nutrition${date ? `?date=${date}` : ''}`),
  createEntry: (body) => request('/nutrition', { method: 'POST', body }),
  updateEntry: (id, body) => request(`/nutrition/${id}`, { method: 'PUT', body }),
  deleteEntry: (id) => request(`/nutrition/${id}`, { method: 'DELETE' }),
};
