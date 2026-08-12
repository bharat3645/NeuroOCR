import React from 'react';
import { Book } from 'lucide-react';
import { Link } from "react-router-dom";

const Navbar = () => {
  return (
    <nav className="bg-[var(--paper-bg)] shadow-sm border-b border-[var(--text-brown)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-3">
            <div className="flex items-center">
              <Book className="h-8 w-8 text-[var(--text-brown)]" />
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-bold text-[var(--text-brown)]">
                NeuroOCR
              </span>
              <span className="text-xs text-[var(--text-brown)] opacity-75">
                Where Paper Meets AI
              </span>
            </div>
          </Link>
          <div className="flex items-center space-x-6">
            <Link
              to="/about"
              className="text-[var(--text-brown)] hover:opacity-75 transition-opacity"
            >
              About
            </Link>
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--text-brown)] hover:opacity-75 transition-opacity"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;