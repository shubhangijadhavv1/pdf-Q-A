import React, { useState, useRef } from "react";
import axios from "axios";
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?worker";
import { Mic, MicOff, Upload, FileText } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerPort = new pdfWorker();

const Chatbot = () => {
  const [pdfText, setPdfText] = useState("");
  const [pdfName, setPdfName] = useState("");
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef(null);

  // 📄 Handle PDF Upload
  const handlePdfUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPdfName(file.name);
    const reader = new FileReader();
    reader.onload = async () => {
      const typedarray = new Uint8Array(reader.result);
      const pdf = await pdfjsLib.getDocument(typedarray).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item) => item.str).join(" ");
        text += pageText + "\n";
      }
      setPdfText(text);
    };
    reader.readAsArrayBuffer(file);
  };

  // 💬 Ask Question
  const askQuestion = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setChat((prev) => [...prev, { sender: "user", text: question }]);

    try {
      const prompt = `
You are an assistant that answers questions based on the following PDF content.
PDF Content:
${pdfText.slice(0, 12000)} 

Question: ${question}
      `;

      const response = await axios.post("http://localhost:5000/api/chat", {
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt },
        ],
      });

      const answer = response.data.choices[0].message.content;
      setChat((prev) => [...prev, { sender: "bot", text: answer }]);
    } catch (err) {
      console.error(err);
      setChat((prev) => [
        ...prev,
        { sender: "bot", text: "⚠ Error fetching answer. Try again." },
      ]);
    } finally {
      setLoading(false);
      setQuestion("");
    }
  };

  // 🎙 Voice Recognition — only fill input, don’t auto-send
  const startRecording = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      alert("Speech recognition not supported in this browser.");
      return;
    }
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event) => {
      const text = event.results[0][0].transcript;
      setQuestion(text); // 👈 just update input box
    };
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => setIsRecording(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      {/* Chat Container */}
      <div className="w-full max-w-3xl  bg-white rounded-2xl shadow-md border border-gray-200 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-center border-b px-4 py-3">
          <h1 className="text-lg font-semibold text-gray-800">Chat with PDF</h1>
        </div>

        {/* PDF Upload Area */}
        <div className="flex flex-col items-center text-center p-6 border-b border-gray-100">
          <Upload className="w-12 h-12 text-gray-400 mb-2" />
          <label className="text-gray-700 font-medium">Upload PDF</label>
          <p className="text-xs text-gray-400 mb-3">(Accept only PDF, Max size: 10MB)</p>
          <input
            type="file"
            accept="application/pdf"
            onChange={handlePdfUpload}
            className="hidden"
            id="pdfInput"
          />
          <label
            htmlFor="pdfInput"
            className="cursor-pointer bg-blue-500 hover:bg-blue-600 text-white text-sm px-4 py-2 rounded-lg transition-all"
          >
            Choose File
          </label>

          {/* {pdfName && (
            <div className="flex items-center mt-3 text-sm text-gray-600">
              <FileText className="w-4 h-4 mr-2 text-blue-500" />
              <span>{pdfName}</span>
            </div>
          )} */}
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
            {pdfName && (
            <div className="flex items-center mt-3 text-sm text-gray-600">
              <FileText className="w-4 h-4 mr-2 text-blue-500" />
              <span>{pdfName}</span>
            </div>
          )}
          {chat.map((msg, idx) => (
            <div
              key={idx}
              className={`p-3 w-fit max-w-[80%] rounded-xl text-sm ${
                msg.sender === "user"
                  ? "ml-auto bg-gray-300 text-gray-800 "
                  : "mr-auto bg-gray-200 text-gray-800 "
              }`}
            >
              {msg.text}
            </div>
          ))}
        </div>

        {/* Input Area */}
        <div className="flex items-center p-3 border-t bg-white">
          <input
            type="text"
            placeholder="Ask a question..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 text-black"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`ml-2 p-2 rounded-full ${
              isRecording ? "bg-red-500 text-white" : "bg-gray-200 hover:bg-gray-300 text-gray-900"
            }`}
          >
            {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          <button
            onClick={askQuestion}
            disabled={loading || !pdfText}
            className="ml-2 bg-blue-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? "Thinking..." : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Chatbot;
