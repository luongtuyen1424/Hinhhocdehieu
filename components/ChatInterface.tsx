
import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, GeometryData } from '../types';
import { Mic, Send, Volume2, VolumeX, X, ChevronDown, ChevronUp, Camera, Image as ImageIcon, Sparkles, BookOpen, Globe } from 'lucide-react';

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, image?: string) => void;
  isLoading: boolean;
  isVoiceEnabled: boolean;
  toggleVoice: () => void;
  geometryData: GeometryData | null;
  currentStepIndex: number;
  setCurrentStepIndex: (index: number) => void;
  onViewImage: (url: string) => void;
}

const MessageItem: React.FC<{ msg: ChatMessage, onViewImage: (url: string) => void }> = ({ msg, onViewImage }) => {
  const [expanded, setExpanded] = useState(false);
  const isLong = msg.text.length > 100 || msg.text.split('\n').length > 3;
  const hasImage = msg.text.startsWith('[Đã gửi ảnh]');
  
  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
        <div 
            className={`max-w-[90%] rounded-2xl p-3 text-sm flex flex-col gap-1 shadow-sm border relative ${
            msg.role === 'user' 
                ? 'bg-blue-600 text-white border-blue-600 rounded-br-none' 
                : 'bg-white text-slate-800 border-slate-100 rounded-bl-none'
            }`}
        >
            {hasImage && msg.image && (
                <div onClick={() => onViewImage(msg.image!)} className="mb-1 cursor-zoom-in active:scale-95 transition-transform">
                    <img src={msg.image} alt="Sent content" className="rounded-lg max-h-32 object-cover border border-white/20 bg-black/10 w-full" />
                </div>
            )}
            <div className={`${!expanded && isLong ? 'line-clamp-3' : ''} whitespace-pre-line leading-relaxed`}>
                {msg.text.replace('[Đã gửi ảnh]', '').trim()}
            </div>
            {isLong && (
                <button 
                    onClick={() => setExpanded(!expanded)}
                    className={`text-xs font-bold mt-1 self-start flex items-center gap-1 ${msg.role === 'user' ? 'text-blue-100 hover:text-white' : 'text-blue-600 hover:text-blue-800'}`}
                >
                    {expanded ? 'Thu gọn' : 'Xem thêm'} {expanded ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
                </button>
            )}
        </div>
    </div>
  );
};

const ChatInterface: React.FC<ChatInterfaceProps> = ({
  messages,
  onSendMessage,
  isLoading,
  isVoiceEnabled,
  toggleVoice,
  geometryData,
  currentStepIndex,
  setCurrentStepIndex,
  onViewImage
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'solution' | 'reasoning'>('chat');
  
  // Draggable State
  const [position, setPosition] = useState({ x: window.innerWidth - 80, y: window.innerHeight - 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const initialPosRef = useRef({ x: 0, y: 0 });
  const hasMovedRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (activeTab === 'chat' && isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeTab, isOpen]);

  // Initial Position (Bottom Right, constrained)
  useEffect(() => {
      const handleResize = () => {
          setPosition(prev => ({
              x: Math.min(prev.x, window.innerWidth - 70),
              y: Math.min(prev.y, window.innerHeight - 70)
          }));
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Speech Logic ---
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;
      recognitionRef.current.lang = 'vi-VN';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        onSendMessage(transcript);
        setIsListening(false);
      };
      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }
  }, [onSendMessage]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
        alert("Trình duyệt không hỗ trợ giọng nói."); return;
    }
    if (isListening) { recognitionRef.current.stop(); } 
    else { recognitionRef.current.start(); setIsListening(true); }
  };

  const handleSend = () => {
    if (!input.trim()) return;
    onSendMessage(input.trim());
    setInput("");
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => onSendMessage("", reader.result as string);
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
            e.preventDefault(); 
            const file = items[i].getAsFile();
            if (file) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    onSendMessage(input, reader.result as string);
                    setInput("");
                };
                reader.readAsDataURL(file);
                return;
            }
        }
    }
  };

  // --- Drag Logic ---
  const handlePointerDown = (e: React.PointerEvent) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      initialPosRef.current = { ...position };
      hasMovedRef.current = false;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasMovedRef.current = true;
      setPosition({ x: initialPosRef.current.x + dx, y: initialPosRef.current.y + dy });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
      e.stopPropagation();
      e.currentTarget.releasePointerCapture(e.pointerId);
      setIsDragging(false);
      if (!hasMovedRef.current) {
          setIsOpen(!isOpen);
      }
  };

  const totalSteps = geometryData?.steps?.length || 0;
  const hasReasoning = geometryData?.reasoning && geometryData.reasoning.length > 0;
  const citations = geometryData?.groundingSource || [];

  return (
    <>
        {/* Unified Draggable Container */}
        <div 
            className="fixed z-50 touch-none select-none flex flex-col items-end gap-1"
            style={{ 
                left: position.x, 
                top: position.y,
                transform: `translate(-${isOpen ? '80%' : '50%'}, -${isOpen ? '95%' : '50%'})`
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
        >
            {/* 1. Chat Window */}
            <div 
                className={`
                    bg-white/95 backdrop-blur-md shadow-2xl rounded-2xl border border-slate-200 overflow-hidden flex flex-col
                    transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] origin-bottom-right
                    ${isOpen ? 'w-[320px] h-[500px] opacity-100 scale-100 mb-0' : 'w-[0px] h-[0px] opacity-0 scale-50 mb-4'}
                `}
                style={{ 
                    maxWidth: '90vw', 
                    maxHeight: '60vh' 
                }}
                onPaste={handlePaste}
                onPointerDown={(e) => e.stopPropagation()} 
            >
                 {/* Header */}
                 <div 
                    className="h-12 bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-between px-4 shrink-0 cursor-move"
                    onPointerDown={handlePointerDown} 
                 >
                    <div className="flex items-center gap-2 text-white font-bold">
                        <Sparkles size={18} className="text-yellow-300"/>
                        <span>Trợ lý AI</span>
                        {isLoading && <span className="flex gap-1 items-center ml-2"><span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce"/><span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce delay-75"/><span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce delay-150"/></span>}
                    </div>
                    <button onClick={toggleVoice} className={`p-1.5 rounded-full ${isVoiceEnabled ? 'text-green-400 bg-white/20' : 'text-blue-200 hover:text-white'}`}>{isVoiceEnabled ? <Volume2 size={16}/> : <VolumeX size={16}/>}</button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 h-10 shrink-0 bg-white">
                    <button onClick={() => setActiveTab('chat')} className={`flex-1 text-xs font-bold transition-colors ${activeTab === 'chat' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>Chat</button>
                    <button onClick={() => setActiveTab('reasoning')} disabled={!hasReasoning} className={`flex-1 text-xs font-bold transition-colors ${activeTab === 'reasoning' ? 'text-amber-600 border-b-2 border-amber-600' : 'text-slate-400 disabled:opacity-30'}`}>Gợi ý</button>
                    <button onClick={() => setActiveTab('solution')} disabled={!geometryData?.mathSolution} className={`flex-1 text-xs font-bold transition-colors ${activeTab === 'solution' ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-slate-400 disabled:opacity-30'}`}>Lời giải</button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto scrollbar-hide bg-slate-50 relative">
                     {activeTab === 'chat' && (
                        <div className="p-3 space-y-3 pb-4">
                            {/* Research Agent Citation Block */}
                            {citations.length > 0 && (
                                <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase mb-2">
                                        <Globe size={12} />
                                        <span>Nguồn tra cứu (Perplexity)</span>
                                    </div>
                                    <div className="space-y-1.5">
                                        {citations.map((cite, idx) => (
                                            <a key={idx} href={cite.url} target="_blank" rel="noopener noreferrer" className="block text-xs text-blue-600 truncate hover:underline bg-white p-1.5 rounded-lg border border-slate-100 shadow-sm flex items-center gap-2">
                                                <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[8px] shrink-0">{idx+1}</span>
                                                <span className="truncate">{cite.title || cite.url}</span>
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {geometryData && totalSteps > 0 && (
                                <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                                    <div className="flex justify-between items-center text-[10px] font-bold text-amber-600 uppercase mb-1">
                                        <span>Bước {currentStepIndex + 1}/{totalSteps}</span>
                                    </div>
                                    <p className="text-xs text-amber-900 leading-relaxed font-medium">{geometryData.steps[currentStepIndex]?.description}</p>
                                </div>
                            )}
                            {messages.map((msg) => <MessageItem key={msg.id} msg={msg} onViewImage={onViewImage} />)}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                    {activeTab === 'reasoning' && (
                        <div className="p-3 space-y-3">
                            {geometryData?.reasoning?.map((step, idx) => (
                                <div key={step.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm text-sm">
                                    <div className="font-bold text-slate-700 mb-1 flex gap-2"><span className="w-5 h-5 flex items-center justify-center bg-amber-100 text-amber-600 rounded-full text-xs shrink-0">{idx+1}</span> {step.question}</div>
                                    <div className="text-slate-600 pl-7 text-xs">{step.answer}</div>
                                </div>
                            ))}
                        </div>
                    )}
                    {activeTab === 'solution' && geometryData?.mathSolution && (
                        <div className="p-4">
                             <div className="prose prose-sm prose-slate max-w-none">
                                <div className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{geometryData.mathSolution}</div>
                             </div>
                        </div>
                    )}
                </div>

                {/* Input Area */}
                {activeTab === 'chat' && (
                    <div className="p-3 bg-white border-t border-slate-100 shrink-0">
                        <div className="flex items-center gap-2">
                             <input type="file" ref={cameraInputRef} className="hidden" accept="image/*" capture="environment" onChange={handleImageSelect} />
                             <input type="file" ref={galleryInputRef} className="hidden" accept="image/*" onChange={handleImageSelect} />
                             
                             {input.length === 0 && (
                                 <div className="flex gap-1">
                                    <button onClick={() => cameraInputRef.current?.click()} className="w-8 h-8 flex items-center justify-center text-blue-600 bg-blue-50 rounded-full active:scale-90 transition-transform"><Camera size={16}/></button>
                                    <button onClick={() => galleryInputRef.current?.click()} className="w-8 h-8 flex items-center justify-center text-emerald-600 bg-emerald-50 rounded-full active:scale-90 transition-transform"><ImageIcon size={16}/></button>
                                 </div>
                             )}
                             
                             <div className="flex-1 bg-slate-100 rounded-full px-4 py-2 flex items-center transition-all focus-within:ring-2 focus-within:ring-blue-100 focus-within:bg-white border border-transparent focus-within:border-blue-200">
                                 <input 
                                    value={input} 
                                    onChange={(e) => setInput(e.target.value)} 
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()} 
                                    placeholder="Hỏi bài..." 
                                    className="bg-transparent border-none focus:ring-0 text-sm w-full p-0 text-slate-800 placeholder-slate-400" 
                                 />
                             </div>
                             {input ? (
                                 <button onClick={handleSend} className="w-9 h-9 flex items-center justify-center bg-blue-600 text-white rounded-full shadow-md active:scale-90 transition-transform"><Send size={16}/></button>
                             ) : (
                                 <button onClick={toggleListening} className={`w-9 h-9 flex items-center justify-center rounded-full shadow-sm active:scale-90 transition-transform ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 text-slate-500'}`}><Mic size={18}/></button>
                             )}
                        </div>
                    </div>
                )}
            </div>

            {/* 2. Unified Bubble (Anchor) */}
            <div 
                className={`
                    w-14 h-14 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] flex items-center justify-center relative cursor-move transition-all duration-300
                    ${isOpen ? 'bg-white text-slate-500 rotate-90 scale-90 mt-[-10px] z-10' : 'bg-gradient-to-tr from-blue-600 to-indigo-600 text-white hover:scale-110'}
                `}
            >
                {isOpen ? <X size={26} /> : <span className="text-2xl animate-in zoom-in duration-300">🤖</span>}
                
                {/* Notification Dot */}
                {!isOpen && !isLoading && messages.length > 1 && (
                    <span className="absolute top-0 right-0 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white" />
                )}
                {/* Loading Ring with Status */}
                {isLoading && !isOpen && (
                     <div className="absolute inset-0 rounded-full border-2 border-white/40 border-t-white animate-spin"/>
                )}
            </div>
        </div>
    </>
  );
};

export default ChatInterface;
