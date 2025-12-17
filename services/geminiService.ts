
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { GeometryData } from "../types";

// Define the response schema structure for Prompt Reference (not strict API enforcement)
const geometrySchemaStructure = {
  type: "object",
  properties: {
    points: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          x: { type: "number" },
          y: { type: "number" },
          z: { type: "number" },
          label: { type: "string" },
          color: { type: "string" }
        },
        required: ["id", "x", "y", "z"]
      }
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          from: { type: "string" },
          to: { type: "string" },
          color: { type: "string" },
          label: { type: "string" },
          marker: { type: "string" }
        },
        required: ["id", "from", "to"]
      }
    },
    faces: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          pointIds: { type: "array", items: { type: "string" } },
          color: { type: "string" },
          opacity: { type: "number" }
        },
        required: ["id", "pointIds"]
      }
    },
    angles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          centerId: { type: "string" },
          arm1Id: { type: "string" },
          arm2Id: { type: "string" },
          type: { type: "string" },
          label: { type: "string" }
        },
        required: ["id", "centerId", "arm1Id", "arm2Id", "type"]
      }
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          stepNumber: { type: "integer" },
          description: { type: "string" },
          activeElementIds: { type: "array", items: { type: "string" } }
        },
        required: ["stepNumber", "description", "activeElementIds"]
      }
    },
    reasoning: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          question: { type: "string" },
          answer: { type: "string" }
        },
        required: ["id", "question", "answer"]
      }
    },
    type: { type: "string", enum: ["2D", "3D"] },
    message: { type: "string" },
    mathSolution: { type: "string" }
  },
  required: ["points", "edges", "steps", "type"]
};

// System Instruction simulating the Multi-Agent Architecture
const SYSTEM_INSTRUCTION = `
Bạn là Hệ Thống Gia Sư AI Thông Minh (All-in-One) dành cho học sinh THCS.
Bạn tích hợp 3 vai trò trong một:

1.  **AGENT CHAT (Giao tiếp):** Thân thiện, ngắn gọn, dễ hiểu.
2.  **AGENT VISUAL (Hình ảnh):** Vẽ hình chính xác, nhận diện đề bài từ ảnh.
3.  **AGENT RESEARCH (Tra cứu - Vai trò Perplexity):**
    *   Tự động TRA CỨU WEB (Google Search) khi gặp các định nghĩa, định lý, hoặc dữ kiện lịch sử toán học để đảm bảo tính chính xác tuyệt đối.
    *   Đối chiếu kiến thức với chuẩn Sách Giáo Khoa (SGK) Việt Nam.

**QUY TẮC QUAN TRỌNG:**
*   **OUTPUT FORMAT:** BẮT BUỘC trả về duy nhất một chuỗi JSON hợp lệ. KHÔNG bao gồm markdown \`\`\`json. KHÔNG bao gồm lời dẫn.
*   **Schema JSON:**
${JSON.stringify(geometrySchemaStructure, null, 2)}

**HƯỚNG DẪN:**
1.  **Vẽ hình:** Tọa độ phải chính xác 3D hoặc 2D. Ký hiệu góc vuông, bằng nhau phải đầy đủ.
2.  **Lời thoại (message):** Ngắn gọn (dưới 50 từ), dùng gạch đầu dòng (-).
3.  **Tra cứu:** Nếu câu hỏi liên quan đến lý thuyết, hãy dùng công cụ tìm kiếm.
`;

export const generateGeometry = async (prompt: string, history: string = "", imageBase64?: string): Promise<GeometryData> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    let finalPrompt = prompt;
    if (!finalPrompt && imageBase64) {
      finalPrompt = "Phân tích đề bài trong ảnh, kiểm tra tính chính xác của hình vẽ và giải chi tiết.";
    }

    const parts: any[] = [{ text: `Lịch sử chat:\n${history}\n\nYêu cầu mới: ${finalPrompt}` }];
    
    if (imageBase64) {
      const base64Data = imageBase64.includes('base64,') 
        ? imageBase64.split('base64,')[1] 
        : imageBase64;
        
      parts.push({
        inlineData: {
          mimeType: "image/jpeg", 
          data: base64Data
        }
      });
    }

    // Call Gemini with Search Tool enabled (Perplexity Role)
    // NOTE: Cannot use responseMimeType: "application/json" with googleSearch tool currently.
    // We strictly enforce JSON in system instruction and parse manually.
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: parts },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }], // Enable Research Agent capability
        temperature: 0.2, 
      },
    });

    let text = response.text;
    if (!text) throw new Error("No response from AI");
    
    // Improved JSON extraction logic to handle mixed text/JSON responses
    let jsonString = text.trim();
    
    // 1. Try to extract from markdown code block ```json ... ```
    const jsonBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonBlockMatch) {
      jsonString = jsonBlockMatch[1];
    } else {
      // 2. Try generic code block ``` ... ```
      const codeBlockMatch = text.match(/```\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch) {
        jsonString = codeBlockMatch[1];
      } else {
        // 3. Fallback: Find the substring from the first '{' to the last '}'
        const firstIndex = text.indexOf('{');
        const lastIndex = text.lastIndexOf('}');
        if (firstIndex !== -1 && lastIndex !== -1 && lastIndex > firstIndex) {
          jsonString = text.substring(firstIndex, lastIndex + 1);
        }
      }
    }
    
    let parsed: GeometryData;
    try {
        parsed = JSON.parse(jsonString) as GeometryData;
    } catch (e) {
        console.error("JSON Parse Error. Extracted string:", jsonString);
        console.error("Original Text:", text);
        throw new Error("Invalid JSON response from AI. The model response could not be parsed.");
    }
    
    // Extract Grounding Metadata (Sources) if available
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    let groundingSource: { title: string; url: string }[] = [];
    
    if (groundingChunks) {
        groundingChunks.forEach((chunk: any) => {
            if (chunk.web) {
                groundingSource.push({ title: chunk.web.title, url: chunk.web.uri });
            }
        });
    }

    return {
      points: parsed.points || [],
      edges: parsed.edges || [],
      faces: parsed.faces || [],
      angles: parsed.angles || [],
      steps: parsed.steps || [],
      reasoning: parsed.reasoning || [],
      type: parsed.type || '2D',
      message: parsed.message,
      mathSolution: parsed.mathSolution,
      groundingSource: groundingSource.length > 0 ? groundingSource : undefined
    };
  } catch (error) {
    console.error("Gemini Error:", error);
    throw error;
  }
};
