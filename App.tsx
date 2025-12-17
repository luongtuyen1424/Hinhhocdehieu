import React, { useState, useEffect, useRef } from 'react';
import Canvas from './components/Canvas';
import ChatInterface from './components/ChatInterface';
import { GeometryData, ChatMessage, Project } from './types';
import { generateGeometry } from './services/geminiService';
import { 
  Menu, Plus, Calculator, X, 
  FolderOpen, Edit2, Trash2, Save, Copy, Download, Upload, Check,
  Sigma, Pi, Triangle
} from 'lucide-react';

const DEFAULT_WELCOME_MSG: ChatMessage = {
  id: 'welcome',
  role: 'model',
  text: 'Chào em! Thầy là trợ lý Toán học. Gõ yêu cầu vào đây nhé.',
  timestamp: Date.now()
};

const App: React.FC = () => {
  // Global Project State
  const [projects, setProjects] = useState<Project[]>(() => {
     try {
       const saved = localStorage.getItem('hinh-hoc-ai-projects');
       return saved ? JSON.parse(saved) : [];
     } catch (e) {
       return [];
     }
  });
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // Renaming State
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");

  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize if empty or select most recent
  useEffect(() => {
    if (projects.length === 0) {
      createProject("Bài toán mới");
    } else if (!currentProjectId) {
      const mostRecent = [...projects].sort((a,b) => b.lastModified - a.lastModified)[0];
      setCurrentProjectId(mostRecent.id);
    }
  }, []);

  // Persist to LocalStorage
  useEffect(() => {
    localStorage.setItem('hinh-hoc-ai-projects', JSON.stringify(projects));
  }, [projects]);

  // Derived Active State
  const activeProject = projects.find(p => p.id === currentProjectId);
  const messages = activeProject?.messages || [DEFAULT_WELCOME_MSG];
  const geometryData = activeProject?.geometryData || null;
  const currentStepIndex = activeProject?.currentStepIndex || 0;

  // Helper to update active project
  const updateActiveProject = (updates: Partial<Project>) => {
    setProjects(prev => prev.map(p => 
      p.id === currentProjectId ? { ...p, ...updates, lastModified: Date.now() } : p
    ));
  };

  // --- Project Management Functions ---

  const createProject = (nameInput?: string) => {
    const name = nameInput || `Bài toán ${projects.length + 1}`;
    const newProj: Project = {
      id: Date.now().toString(),
      name: name,
      subjectId: 'math', 
      messages: [{ ...DEFAULT_WELCOME_MSG, timestamp: Date.now() }],
      geometryData: null,
      currentStepIndex: 0,
      lastModified: Date.now()
    };
    setProjects(prev => [newProj, ...prev]);
    setCurrentProjectId(newProj.id);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const duplicateProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const projToClone = projects.find(p => p.id === id);
    if (!projToClone) return;

    const newProj: Project = {
      ...projToClone,
      id: Date.now().toString(),
      name: `${projToClone.name} (Copy)`,
      lastModified: Date.now()
    };
    setProjects(prev => [newProj, ...prev]);
  };

  const deleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm("Xóa bài toán này vĩnh viễn?")) {
      const newProjects = projects.filter(p => p.id !== id);
      setProjects(newProjects);
      
      if (currentProjectId === id) {
        if (newProjects.length > 0) {
          setCurrentProjectId(newProjects[0].id);
        } else {
          createProject("Bài toán mới");
        }
      }
    }
  };

  const startRenaming = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProjectId(id);
    setEditingNameValue(currentName);
  };

  const saveRename = () => {
    if (editingProjectId && editingNameValue.trim()) {
      setProjects(prev => prev.map(p => p.id === editingProjectId ? { ...p, name: editingNameValue.trim() } : p));
    }
    setEditingProjectId(null);
    setEditingNameValue("");
  };

  const exportProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const proj = projects.find(p => p.id === id);
    if (!proj) return;
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(proj));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${proj.name.replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchorNode); 
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (json.id && json.name && json.messages) {
           const newProj: Project = { 
               ...json, 
               id: Date.now().toString(), 
               name: json.name + " (Import)",
               lastModified: Date.now() 
           };
           setProjects(prev => [newProj, ...prev]);
           setCurrentProjectId(newProj.id);
           if (window.innerWidth < 768) setIsSidebarOpen(false);
        } else {
            alert("File dự án không hợp lệ!");
        }
      } catch (err) {
        console.error(err);
        alert("Lỗi đọc file! Vui lòng chọn đúng file .json");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // reset
  };

  // --- Logic ---

  const getHistoryText = () => {
    return messages.map(m => `${m.role === 'user' ? 'Học sinh' : 'Gia sư'}: ${m.text}`).join('\n');
  };

  const handleSendMessage = async (text: string, image?: string) => {
    if (!currentProjectId) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: image ? `[Đã gửi ảnh] ${text}` : text,
      timestamp: Date.now(),
      image: image
    };
    
    const updatedMessages = [...messages, userMsg];
    updateActiveProject({ messages: updatedMessages });
    
    setIsLoading(true);

    try {
      const history = getHistoryText(); 
      const data = await generateGeometry(text, history + `\nHọc sinh: ${userMsg.text}`, image);
      
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: data.message || `Đã giải xong.`,
        timestamp: Date.now()
      };

      updateActiveProject({
        messages: [...updatedMessages, aiMsg],
        geometryData: data,
        currentStepIndex: 0
      });

    } catch (error) {
      console.error(error);
      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: "Xin lỗi, có lỗi hệ thống.",
        timestamp: Date.now()
      };
      updateActiveProject({
        messages: [...updatedMessages, errorMsg]
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSpeak = (text: string) => {
    if (!isVoiceEnabled || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="h-screen w-screen flex bg-slate-50 overflow-hidden font-sans">
      
      {/* Sidebar Navigation (Collapsible) */}
      <div 
        className={`fixed inset-y-0 left-0 z-30 w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } flex flex-col shadow-xl md:shadow-none shrink-0`}
      >
          {/* Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-blue-50/50">
            <h1 className="text-xl font-bold text-blue-900 flex items-center gap-2">
              <div className="bg-blue-600 text-white p-1.5 rounded-lg">
                <Calculator size={20} />
              </div>
              Toán THCS
            </h1>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-slate-600"><X size={24} /></button>
          </div>

          {/* Project List & Actions */}
          <div className="p-4 shrink-0 grid grid-cols-2 gap-2">
            <button onClick={() => createProject()} className="col-span-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center gap-2 transition-all font-bold"><Plus size={20} /> Bài toán mới</button>
            <button onClick={handleImportClick} className="py-2 px-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold shadow-sm"><Upload size={14} /> Mở file</button>
            <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileImport} />
            <div className="flex items-center justify-center text-[10px] text-slate-400"><Save size={10} className="mr-1" /> Tự động lưu</div>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide px-3 py-2 space-y-6">
            <div>
              <div className="px-3 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2"><FolderOpen size={14} /> Lịch sử bài tập</span>
              </div>
              <div className="space-y-1">
                {projects.map((proj) => {
                  const isActive = currentProjectId === proj.id;
                  const isEditing = editingProjectId === proj.id;
                  
                  return (
                    <div
                      key={proj.id}
                      onClick={() => { if (!isEditing) { setCurrentProjectId(proj.id); if (window.innerWidth < 768) setIsSidebarOpen(false); }}}
                      className={`group w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all cursor-pointer relative border ${isActive ? 'bg-blue-50 border-blue-200 shadow-sm' : 'hover:bg-slate-50 border-transparent text-slate-600'}`}
                    >
                      <div className={`p-2 rounded-lg shrink-0 ${isActive ? 'bg-white text-blue-600 shadow-sm' : 'bg-slate-100 text-slate-400'}`}>
                        {proj.name.toLowerCase().includes('đại') || proj.name.toLowerCase().includes('số') ? <Sigma size={18}/> : <Triangle size={18} />}
                      </div>
                      
                      {isEditing ? (
                        <div className="flex-1 min-w-0 flex items-center gap-1">
                           <input type="text" value={editingNameValue} onChange={(e) => setEditingNameValue(e.target.value)} onBlur={saveRename} onKeyDown={(e) => e.key === 'Enter' && saveRename()} autoFocus className="flex-1 min-w-0 bg-white border border-blue-400 rounded px-2 py-1 text-sm text-slate-900 focus:outline-none shadow-sm" onClick={(e) => e.stopPropagation()}/>
                           <button onClick={(e) => { e.stopPropagation(); saveRename(); }} className="text-green-600 p-1 hover:bg-green-50 rounded"><Check size={14} /></button>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <div className={`font-medium truncate text-sm ${isActive ? 'text-blue-900' : 'text-slate-700'}`}>{proj.name}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">{new Date(proj.lastModified).toLocaleDateString('vi-VN')}</div>
                        </div>
                      )}
                      
                      {!isEditing && (
                        <div className={`absolute right-2 bg-white/95 backdrop-blur-sm rounded-lg p-1 shadow-sm border border-slate-100 flex items-center gap-1 ${isActive ? 'flex' : 'hidden group-hover:flex'} transition-all z-10`}>
                          <button onClick={(e) => startRenaming(proj.id, proj.name, e)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded"><Edit2 size={12} /></button>
                          <button onClick={(e) => duplicateProject(proj.id, e)} className="p-1.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded"><Copy size={12} /></button>
                          <button onClick={(e) => exportProject(proj.id, e)} className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-purple-50 rounded"><Download size={12} /></button>
                          <button onClick={(e) => deleteProject(proj.id, e)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={12} /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
      </div>

      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/20 z-20 md:hidden backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Main Content Area - Full Canvas with Floating Chat */}
      <div className="flex-1 flex h-full relative overflow-hidden bg-slate-50">
        
        {/* Mobile Header Toggle */}
        <div className="md:hidden absolute top-4 left-4 z-10">
          <button onClick={() => setIsSidebarOpen(true)} className="p-3 bg-white rounded-full shadow-lg border border-slate-200 text-slate-700"><Menu size={24} /></button>
        </div>

        {/* Canvas Area (Takes Full Space) */}
        <div className="absolute inset-0 z-0">
          <Canvas 
            key={currentProjectId}
            data={geometryData} 
            currentStepIndex={currentStepIndex}
            onDataUpdate={(newData) => updateActiveProject({ geometryData: newData })}
            onSpeak={handleSpeak}
          />
        </div>

        {/* Floating Chat Interface Overlay */}
        <ChatInterface 
          key={currentProjectId}
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          isVoiceEnabled={isVoiceEnabled}
          toggleVoice={() => setIsVoiceEnabled(!isVoiceEnabled)}
          geometryData={geometryData}
          currentStepIndex={currentStepIndex}
          setCurrentStepIndex={(idx) => updateActiveProject({ currentStepIndex: idx })}
          onViewImage={(url) => setViewingImage(url)}
        />

        {/* Image Viewer Overlay (Lightbox) */}
        {viewingImage && (
          <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
             <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden">
                <button 
                  onClick={() => setViewingImage(null)} 
                  className="absolute top-4 right-4 p-3 bg-white/10 text-white hover:bg-white/20 rounded-full z-10"
                >
                  <X size={24} />
                </button>
                <div className="flex-1 w-full flex items-center justify-center overflow-auto touch-none">
                  <img 
                    src={viewingImage} 
                    className="max-w-none max-h-none"
                    style={{ maxHeight: '100%', maxWidth: '100%' }} // Basic fit, allowing pinch zoom natively in browser if viewport allowed, or simple scroll
                    alt="Exam Preview" 
                  />
                  {/* Note: True Pinch-to-zoom in a web div requires complex gesture logic. 
                      For a simple MVP, enabling native scroll or simple fit is often enough, 
                      or just letting the browser handle the img in a new tab. 
                      Here we rely on max-w/h to fit, users can pinch-zoom the page if meta viewport allows, 
                      but we set user-scalable=no in index.html. 
                      So we rely on simple scrollable container if image is large. 
                      For "Pan", overflow-auto helps.
                  */}
                </div>
                <div className="h-12 flex items-center justify-center text-white/70 text-sm">
                   Dùng 2 ngón tay để phóng to (nếu hỗ trợ) hoặc kéo để xem.
                </div>
             </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default App;