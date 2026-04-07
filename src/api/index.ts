const API_URL = '/api';

const getHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
};

const handleResponse = async (res: Response) => {
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      return { error: data.message || data.error || res.statusText };
    }
    return data;
  } else {
    const text = await res.text();
    if (!res.ok) {
      return { error: text || res.statusText };
    }
    return { message: text };
  }
};

export const api = {
  auth: {
    login: (data: any) => fetch(`${API_URL}/auth/login`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    register: (data: any) => fetch(`${API_URL}/auth/register`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    checkEmail: (email: string) => fetch(`${API_URL}/auth/check-email?email=${encodeURIComponent(email)}`, { headers: getHeaders() }).then(handleResponse),
    me: () => fetch(`${API_URL}/auth/me`, { headers: getHeaders() }).then(handleResponse),
    onboarding: (data: any) => fetch(`${API_URL}/auth/onboarding`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    updateProfile: (data: any) => fetch(`${API_URL}/auth/profile`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    updateAccount: (data: any) => fetch(`${API_URL}/auth/account/update`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    deleteAccount: () => fetch(`${API_URL}/auth/account`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),
  },
  units: {
    getAll: () => fetch(`${API_URL}/units`, { headers: getHeaders() }).then(handleResponse),
    create: (data: any) => fetch(`${API_URL}/units`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    update: (id: number, data: any) => fetch(`${API_URL}/units/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    delete: (id: number) => fetch(`${API_URL}/units/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),
    createExam: (data: any) => fetch(`${API_URL}/units/exams`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    getExams: () => fetch(`${API_URL}/units/exams`, { headers: getHeaders() }).then(handleResponse),
    updateExam: (id: number, data: any) => fetch(`${API_URL}/units/exams/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    deleteExam: (id: number) => fetch(`${API_URL}/units/exams/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),
    generateRevisionPlan: (examId: number, data: any) => fetch(`${API_URL}/units/exams/${examId}/revision-plan`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    generateStudyPlan: (plan: any) => fetch(`${API_URL}/units/generate-study-plan`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ plan }) }).then(handleResponse),
    clearAllAcademicData: () => fetch(`${API_URL}/units/clear-all`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),
  },
  projects: {
    getAll: () => fetch(`${API_URL}/projects`, { headers: getHeaders() }).then(handleResponse),
    create: (data: any) => fetch(`${API_URL}/projects`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    update: (id: number, data: any) => fetch(`${API_URL}/projects/${id}`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    delete: (id: number) => fetch(`${API_URL}/projects/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),
    updateTask: (id: number, status?: string, note?: string) => fetch(`${API_URL}/projects/tasks/${id}`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ status, note }) }).then(handleResponse),
  },
  internships: {
    getAll: () => fetch(`${API_URL}/internships`, { headers: getHeaders() }).then(handleResponse),
    create: (data: any) => fetch(`${API_URL}/internships`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    update: (id: number, data: any) => fetch(`${API_URL}/internships/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    delete: (id: number) => fetch(`${API_URL}/internships/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),
    createTask: (id: number, data: any) => fetch(`${API_URL}/internships/${id}/tasks`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    updateTask: (id: number, status: string) => fetch(`${API_URL}/internships/tasks/${id}`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ status }) }).then(handleResponse),
    editTask: (id: number, data: any) => fetch(`${API_URL}/internships/tasks/${id}`, { method: 'PUT', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    deleteTask: (id: number) => fetch(`${API_URL}/internships/tasks/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),
    updateSubtask: (id: number, status: string) => fetch(`${API_URL}/internships/subtasks/${id}`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ status }) }).then(handleResponse),
    deleteSubtask: (id: number) => fetch(`${API_URL}/internships/subtasks/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),
  },
  bootcamps: {
    getAll: () => fetch(`${API_URL}/bootcamps`, { headers: getHeaders() }).then(handleResponse),
    create: (data: any) => fetch(`${API_URL}/bootcamps`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    update: (id: number, data: any) => fetch(`${API_URL}/bootcamps/${id}`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    delete: (id: number) => fetch(`${API_URL}/bootcamps/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),
  },
  todos: {
    getAll: () => fetch(`${API_URL}/todos`, { headers: getHeaders() }).then(handleResponse),
    create: (data: any) => fetch(`${API_URL}/todos`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    update: (id: number, data: any) => fetch(`${API_URL}/todos/${id}`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    delete: (id: number) => fetch(`${API_URL}/todos/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),
    deleteRelated: (type: string, id: number | string) => fetch(`${API_URL}/todos/related/${type}/${id}`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),
  },
  schedule: {
    get: () => fetch(`${API_URL}/schedule`, { headers: getHeaders() }).then(handleResponse),
    generate: (data: any) => fetch(`${API_URL}/schedule/generate`, { method: 'POST', headers: getHeaders(), body: JSON.stringify(data) }).then(handleResponse),
    update: (id: number, status: string) => fetch(`${API_URL}/schedule/${id}`, { method: 'PATCH', headers: getHeaders(), body: JSON.stringify({ status }) }).then(handleResponse),
  },
  health: {
    getHydration: () => fetch(`${API_URL}/health/hydration/today`, { headers: getHeaders() }).then(handleResponse),
    logHydration: (amount_ml: number) => fetch(`${API_URL}/health/hydration`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ amount_ml }) }).then(handleResponse),
    resetHydration: () => fetch(`${API_URL}/health/hydration/today`, { method: 'DELETE', headers: getHeaders() }).then(handleResponse),
  }
};
