import React from 'react';
import Navbar from './Navbar';
import { Code2, Brain, Cpu, Timer, FileText, Download, PenTool, Workflow } from 'lucide-react';

const About: React.FC = () => {
  const features = [
    {
      icon: <FileText className="w-6 h-6" />,
      title: "Input Support",
      description: "Process handwritten notes, scanned documents, and receipts in JPEG, PNG, or PDF formats"
    },
    {
      icon: <Brain className="w-6 h-6" />,
      title: "AI-Powered OCR",
      description: "Advanced text recognition using pre-trained models for accurate results"
    },
    {
      icon: <PenTool className="w-6 h-6" />,
      title: "Multiple Styles",
      description: "Support for various handwriting styles including cursive and block letters"
    },
    {
      icon: <Download className="w-6 h-6" />,
      title: "Export Options",
      description: "Copy to clipboard or download as text/PDF with formatting preserved"
    }
  ];

  const techStack = [
    {
      icon: <Code2 className="w-6 h-6" />,
      title: "Frontend",
      description: "React with TypeScript, Tailwind CSS for styling, and modern hooks for state management"
    },
    {
      icon: <Workflow className="w-6 h-6" />,
      title: "Middleware",
      description: "Node.js server handling file uploads and API coordination"
    },
    {
      icon: <Cpu className="w-6 h-6" />,
      title: "Backend",
      description: "Flask (Python) for image processing and OCR using advanced libraries"
    },
    {
      icon: <Timer className="w-6 h-6" />,
      title: "Processing",
      description: "Real-time feedback with confidence scores and instant preview"
    }
  ];

  return (
    <div className="min-h-screen bg-[var(--cream-bg)]">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-16">
          <h1 className="text-4xl font-bold text-[var(--text-brown)] mb-4">About NeuroOCR</h1>
          <p className="text-lg text-[var(--text-brown)] opacity-80 max-w-3xl mx-auto">
            An AI-powered OCR tool that revolutionizes the way you digitize handwritten text. 
            Built with cutting-edge technology to provide accurate, fast, and reliable text recognition.
          </p>
        </div>

        <div className="mb-16">
          <h2 className="text-2xl font-bold text-[var(--text-brown)] mb-8 text-center">Key Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="bg-[var(--paper-bg)] p-6 rounded-lg shadow-lg">
                <div className="text-[var(--text-brown)] mb-4">
                  {feature.icon}
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-brown)] mb-2">{feature.title}</h3>
                <p className="text-[var(--text-brown)] opacity-80">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-16">
          <h2 className="text-2xl font-bold text-[var(--text-brown)] mb-8 text-center">Technology Stack</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {techStack.map((tech, index) => (
              <div key={index} className="bg-[var(--paper-bg)] p-6 rounded-lg shadow-lg">
                <div className="text-[var(--text-brown)] mb-4">
                  {tech.icon}
                </div>
                <h3 className="text-lg font-semibold text-[var(--text-brown)] mb-2">{tech.title}</h3>
                <p className="text-[var(--text-brown)] opacity-80">{tech.description}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[var(--paper-bg)] p-8 rounded-lg shadow-lg">
          <h2 className="text-2xl font-bold text-[var(--text-brown)] mb-4">Development Timeline</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <div className="bg-[var(--cream-bg)] px-4 py-2 rounded font-semibold text-[var(--text-brown)]">Hour 1</div>
              <div className="flex-1">
                <h3 className="font-semibold text-[var(--text-brown)]">Project Setup</h3>
                <p className="text-[var(--text-brown)] opacity-80">Initialize React, Node.js, and Flask applications with necessary dependencies</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-[var(--cream-bg)] px-4 py-2 rounded font-semibold text-[var(--text-brown)]">Hour 2-3</div>
              <div className="flex-1">
                <h3 className="font-semibold text-[var(--text-brown)]">Core Development</h3>
                <p className="text-[var(--text-brown)] opacity-80">Implement upload functionality, OCR processing, and basic UI components</p>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="bg-[var(--cream-bg)] px-4 py-2 rounded font-semibold text-[var(--text-brown)]">Hour 4-5</div>
              <div className="flex-1">
                <h3 className="font-semibold text-[var(--text-brown)]">Refinement</h3>
                <p className="text-[var(--text-brown)] opacity-80">Add export features, improve UI/UX, and perform thorough testing</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default About;