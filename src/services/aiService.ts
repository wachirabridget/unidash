import { GoogleGenAI, Type } from "@google/genai";

export const aiService = {
  generateProjectTasks: async (projectName: string, description: string) => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Break down the following university project into a list of manageable tasks with estimated durations in minutes. 
        Project Name: ${projectName}
        Description: ${description}
        
        Provide the output as a JSON array of objects, each with 'title' and 'duration' (number in minutes).`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: "A short, descriptive title for the task.",
                },
                duration: {
                  type: Type.NUMBER,
                  description: "Estimated duration in minutes.",
                },
              },
              required: ["title", "duration"],
            },
          },
        },
      });

      const jsonStr = response.text?.trim();
      if (jsonStr) {
        return JSON.parse(jsonStr);
      }
      return [];
    } catch (error) {
      console.error("AI Generation Error:", error);
      throw error;
    }
  },
  generateInternshipTaskBreakdown: async (taskTitle: string, description: string, deadline: string, internshipRole: string, workingDays: string[]) => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `I have an internship task for a ${internshipRole} role.
        Task: ${taskTitle}
        Description: ${description}
        Deadline: ${deadline}
        Working Days: ${workingDays.join(', ')}
        
        Break down this task into a list of manageable subtasks based on the description, deadline, and available working days. 
        Provide the output as a JSON array of objects, each with a 'title' (string).`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: "A short, descriptive title for the subtask.",
                },
              },
              required: ["title"],
            },
          },
        },
      });

      const jsonStr = response.text?.trim();
      if (jsonStr) {
        return JSON.parse(jsonStr);
      }
      return [];
    } catch (error) {
      console.error("AI Generation Error:", error);
      throw error;
    }
  },
  generateRevisionPlan: async (unitName: string, examType: string, examDate: string, profile: any, remainingDays: number, isTimeConstrained: boolean) => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Create a personalized revision plan for an upcoming ${examType} in the unit "${unitName}".
        Exam Date: ${examDate}
        Context:
        - Remaining Days: ${remainingDays} days
        - Planning Mode: ${isTimeConstrained ? 'Time-constrained/Intensive (Needs to prioritize high-impact topics)' : 'Standard 4-week window'}
        
        User's Concentration Profile:
        - Concentration Span: ${profile.concentrationDuration} minutes
        - Workload Tolerance: ${profile.workloadTolerance}
        - Preferred Study Hours: ${profile.preferredStudyHours[0]}:00 to ${profile.preferredStudyHours[1]}:00
        
        ${isTimeConstrained 
          ? `Since there are only ${remainingDays} days left, generate an intensive revision plan. 
             Focus on the most critical topics and practice problems. 
             Schedule sessions daily leading up to the exam.` 
          : `Generate a comprehensive revision plan for the 4 weeks (28 days) leading up to the exam. 
             The plan should follow a spaced repetition approach:
             - Week 1-2: Initial deep review of all topics.
             - Week 3: Focused review on difficult areas and practice problems.
             - Week 4: Final review, mock exams, and quick summaries.`}
        
        Each task should have:
        - 'activity': A specific topic or revision activity (e.g., "Review Chapter 1: Introduction to Calculus").
        - 'date': The suggested date for this activity (YYYY-MM-DD). 
          IMPORTANT: All dates must be between today and the day BEFORE the exam.
        - 'duration': Suggested duration in minutes (should be around the user's concentration span).
        - 'priority': 'high', 'medium', or 'low'.
        
        Provide the output as a JSON array of objects.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                activity: { type: Type.STRING },
                date: { type: Type.STRING },
                duration: { type: Type.NUMBER },
                priority: { type: Type.STRING },
              },
              required: ["activity", "date", "duration", "priority"],
            },
          },
        },
      });

      const jsonStr = response.text?.trim();
      if (jsonStr) {
        return JSON.parse(jsonStr);
      }
      return [];
    } catch (error) {
      console.error("AI Revision Plan Error:", error);
      throw error;
    }
  },
  generateStudyPlan: async (units: any[], profile: any, remainingWeeks: number, isMidSemester: boolean) => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Create a comprehensive ${isMidSemester ? 'accelerated ' : ''}semester study plan for a student with the following units:
        Units: ${units.map(u => `${u.unitName} (ID: ${u.id})`).join(', ')}
        
        Context:
        - Remaining Weeks in Semester: ${remainingWeeks} weeks
        - Planning Mode: ${isMidSemester ? 'Mid-semester start (Needs to be more intensive/focused)' : 'Full semester start'}
        
        User's Concentration Profile:
        - Concentration Span: ${profile.concentrationDuration} minutes
        - Workload Tolerance: ${profile.workloadTolerance}
        
        For each unit, provide a list of specific study topics or chapters to cover. 
        ${isMidSemester 
          ? `Since there are only ${remainingWeeks} weeks left, focus on the most critical topics (approx. ${Math.max(5, Math.min(10, remainingWeeks * 1.5))} topics per unit).` 
          : 'Provide a list of 10-15 specific study topics or chapters per unit.'}
        
        Include "Ongoing Review" sessions every 2 weeks for each unit to ensure consistent retention.
        Each task should have:
        - 'unitName': The name of the unit.
        - 'unitId': The ID of the unit.
        - 'topic': A specific topic or activity.
        - 'duration': Suggested duration in minutes (around the user's concentration span).
        
        Provide the output as a JSON array of objects.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                unitName: { type: Type.STRING },
                unitId: { type: Type.NUMBER },
                topic: { type: Type.STRING },
                duration: { type: Type.NUMBER },
              },
              required: ["unitName", "unitId", "topic", "duration"],
            },
          },
        },
      });

      const jsonStr = response.text?.trim();
      if (jsonStr) {
        const plan = JSON.parse(jsonStr);
        // Map unitId correctly if needed, but we'll trust the AI or post-process
        return plan;
      }
      return [];
    } catch (error) {
      console.error("AI Study Plan Error:", error);
      throw error;
    }
  }
};
