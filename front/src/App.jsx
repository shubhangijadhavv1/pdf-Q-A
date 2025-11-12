import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.mjs";
import { Mic, MicOff, Upload, FileText, Send, Loader2 } from "lucide-react";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

const Chatbot = () => {
  const [pdfText, setPdfText] = useState("");
  const [pdfName, setPdfName] = useState("");
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const recognitionRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chat]);

  // 📄 Handle PDF Upload
  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type and size
    if (file.type !== "application/pdf") {
      setUploadStatus("❌ Please upload a PDF file");
      return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      setUploadStatus("❌ File size must be less than 10MB");
      return;
    }

    setPdfName(file.name);
    setUploadStatus("📄 Processing PDF...");

    const reader = new FileReader();
    
    reader.onload = async (event) => {
      try {
        const typedarray = new Uint8Array(event.target.result);
        const pdf = await pdfjsLib.getDocument(typedarray).promise;
        
        let text = "";
        const maxPages = Math.min(pdf.numPages, 50); // Limit to 50 pages for performance
        
        for (let i = 1; i <= maxPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const pageText = content.items.map((item) => item.str).join(" ");
          text += pageText + "\n";
        }

        setPdfText(text);
        setUploadStatus(`✅ PDF processed successfully (${maxPages} pages)`);
        
        // Add system message
        setChat([{ 
          sender: "bot", 
          text: `I've loaded your PDF "${file.name}". You can now ask questions about its content.` 
        }]);

      } catch (error) {
        console.error("PDF processing error:", error);
        setUploadStatus("❌ Error processing PDF");
      }
    };

    reader.onerror = () => {
      setUploadStatus("❌ Error reading file");
    };

    reader.readAsArrayBuffer(file);
  };

  // 💬 Ask Question
  const askQuestion = async () => {
    if (!question.trim()) return;
    if (!pdfText) {
      setChat(prev => [...prev, { 
        sender: "bot", 
        text: "⚠️ Please upload a PDF first before asking questions." 
      }]);
      return;
    }

    const userQuestion = question.trim();
    setLoading(true);
    setChat(prev => [...prev, { sender: "user", text: userQuestion }]);
    setQuestion("");

    try {
      // Limit PDF text to avoid token limits
      const limitedPdfText = pdfText.slice(0, 15000);
      
      const prompt = `
Please answer the following question based ONLY on the provided PDF content. If the answer cannot be found in the PDF, please say so.

PDF Content:
${limitedPdfText}

Question: ${userQuestion}

Answer:`;

      const response = await axios.post("http://localhost:5000/api/chat", {
        question: prompt
      });

      const answer = response.data.answer;
      setChat(prev => [...prev, { sender: "bot", text: answer }]);

    } catch (error) {
      console.error("API Error:", error);
      
      let errorMessage = "⚠️ Error fetching answer. Please try again.";
      
      if (error.response?.status === 401) {
        errorMessage = "🔑 API key error. Please check your Gemini API configuration.";
      } else if (error.response?.status === 429) {
        errorMessage = "⏳ Rate limit exceeded. Please wait a moment and try again.";
      } else if (error.response?.data?.error) {
        errorMessage = `⚠️ ${error.response.data.error}`;
      }

      setChat(prev => [...prev, { sender: "bot", text: errorMessage }]);
    } finally {
      setLoading(false);
    }
  };

  // 🎙 Voice Recognition
  const startRecording = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      alert("Speech recognition is not supported in your browser. Try Chrome or Edge.");
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => setIsRecording(true);
    
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setQuestion(prev => prev + " " + transcript);
    };
    
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = (event) => {
      console.error("Speech recognition error:", event.error);
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      askQuestion();
    }
  };

  const clearChat = () => {
    setChat([]);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      {/* Main Chat Container */}
      <div className="w-full max-w-4xl h-[80vh] bg-white rounded-2xl shadow-xl border border-gray-200 flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
          <h1 className="text-xl font-bold text-gray-800">PDF Chat Assistant</h1>
          <div className="flex items-center space-x-2">
            {pdfName && (
              <button
                onClick={clearChat}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
              >
                Clear Chat
              </button>
            )}
          </div>
        </div>

        {/* PDF Upload Section */}
        {!pdfText && (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <Upload className="w-10 h-10 text-blue-500" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-800 mb-2">Upload PDF</h2>
            <p className="text-gray-600 mb-6 max-w-md">
              Upload a PDF document to start chatting with its content using AI.
            </p>
            
            <input
              type="file"
              accept="application/pdf"
              onChange={handlePdfUpload}
              className="hidden"
              id="pdfInput"
            />
            <label
              htmlFor="pdfInput"
              className="cursor-pointer bg-blue-500 hover:bg-blue-600 text-white font-medium px-6 py-3 rounded-lg transition-all shadow-md hover:shadow-lg"
            >
              Choose PDF File
            </label>
            <p className="text-xs text-gray-500 mt-3">Max size: 10MB</p>
          </div>
        )}

        {/* Chat Interface */}
        {pdfText && (
          <>
            {/* PDF Info */}
            <div className="px-6 py-3 bg-blue-50 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <FileText className="w-5 h-5 text-blue-500 mr-2" />
                  <span className="text-sm font-medium text-gray-700">{pdfName}</span>
                </div>
                {uploadStatus && (
                  <span className={`text-xs ${
                    uploadStatus.includes("✅") ? "text-green-600" : 
                    uploadStatus.includes("❌") ? "text-red-600" : "text-blue-600"
                  }`}>
                    {uploadStatus}
                  </span>
                )}
              </div>
            </div>

            {/* Chat Messages */}
            <div 
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto p-6 space-y-4 bg-gray-50"
            >
              {chat.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                      msg.sender === "user"
                        ? "bg-blue-500 text-white rounded-br-none"
                        : "bg-white text-gray-800 border border-gray-200 rounded-bl-none shadow-sm"
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {msg.text}
                    </div>
                  </div>
                </div>
              ))}
              
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm">
                    <div className="flex items-center space-x-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      <span className="text-sm text-gray-600">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input Area */}
            <div className="border-t bg-white p-4">
              <div className="flex items-end space-x-2">
                <div className="flex-1 relative">
                  <textarea
                    placeholder="Ask a question about your PDF..."
                    className="w-full border border-gray-300 rounded-lg px-4 py-3 pr-24 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent text-gray-800 resize-none"
                    rows="1"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={loading}
                  />
                  <div className="absolute right-2 bottom-2 flex space-x-1">
                    <button
                      onClick={isRecording ? stopRecording : startRecording}
                      className={`p-2 rounded-full transition-colors ${
                        isRecording
                          ? "bg-red-100 text-red-600 hover:bg-red-200"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}
                      disabled={loading}
                    >
                      {isRecording ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                  </div>
                </div>
                
                <button
                  onClick={askQuestion}
                  disabled={loading || !question.trim()}
                  className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white p-3 rounded-lg transition-all duration-200 flex items-center justify-center"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      
    </div>
  );
};

export default Chatbot;