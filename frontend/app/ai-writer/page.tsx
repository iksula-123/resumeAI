'use client'

import { useState } from 'react'
import { api } from '@/lib/api'
import AppShell from '@/components/AppShell'

const SECTIONS = ['Professional Summary', 'Work Experience', 'Skills', 'Cover Letter', 'LinkedIn Bio', 'Objective']

export default function AiWriterPage() {
  const [activeSection, setActiveSection] = useState('Professional Summary')
  const [input, setInput] = useState('')
  const [output, setOutput] = useState('')
  const [loading, setLoading] = useState(false)
  const [jobTitle, setJobTitle] = useState('')
  const [company, setCompany] = useState('')

  const generate = async () => {
    if (!input.trim() && !jobTitle.trim()) return
    setLoading(true)
    setOutput('')
    try {
      if (activeSection === 'Professional Summary') {
        const r = await api.post<{ summary: string }>('/api/ai/generate-summary', {
          experience: input, skills: '',
        })
        setOutput(r.summary)
      } else if (activeSection === 'Cover Letter') {
        const r = await api.post<{ cover_letter: string }>('/api/ai/generate-cover-letter', {
          job_title: jobTitle, company, job_description: input,
          applicant_name: '', resume_summary: '',
        })
        setOutput(r.cover_letter)
      } else {
        setOutput(`Here is your AI-generated ${activeSection}:\n\n${input.length > 0 ? `Based on your input: "${input.substring(0, 50)}...", we recommend highlighting your key achievements and using strong action verbs to make your ${activeSection.toLowerCase()} stand out. Quantify your accomplishments with specific numbers and metrics where possible.` : `Please provide some details about your experience or role to generate personalized content.`}`)
      }
    } catch {
      setOutput('AI generation is not available at the moment. Please check your API key configuration.')
    } finally {
      setLoading(false)
    }
  }

  const topBar = (
    <>
      <div className="flex-1">
        <h1 className="text-sm font-semibold text-gray-800">AI Writer</h1>
        <p className="text-xs text-gray-400">Let AI craft your perfect resume content</p>
      </div>
      <div className="flex items-center gap-2 text-xs text-purple-600 bg-purple-50 px-3 py-1.5 rounded-full">
        <span>✨</span> AI Powered
      </div>
    </>
  )

  return (
    <AppShell topBar={topBar}>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="grid grid-cols-3 gap-6">

          {/* Left: Section selector */}
          <div className="col-span-1">
            <div className="panel-premium p-4">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Select Section</div>
              <div className="space-y-1">
                {SECTIONS.map(sec => (
                  <button key={sec} onClick={() => { setActiveSection(sec); setOutput('') }}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition ${
                      activeSection === sec
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-gray-600 hover:bg-gray-50'
                    }`}>
                    {sec}
                  </button>
                ))}
              </div>
            </div>

            {/* Tips */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-4 mt-4 border border-indigo-100">
              <div className="text-xs font-semibold text-indigo-800 mb-2">💡 Pro Tips</div>
              <ul className="text-xs text-indigo-700 space-y-1.5">
                <li>• Be specific about your role and industry</li>
                <li>• Include years of experience</li>
                <li>• Mention key technologies or tools</li>
                <li>• Add target job title for better results</li>
              </ul>
            </div>
          </div>

          {/* Right: Generator */}
          <div className="col-span-2 space-y-4">
            <div className="panel-premium p-5">
              <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <span className="text-xl">✨</span> {activeSection} Generator
              </h2>

              {activeSection === 'Cover Letter' && (
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Job Title</label>
                    <input value={jobTitle} onChange={e => setJobTitle(e.target.value)}
                      placeholder="Senior React Developer"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Company</label>
                    <input value={company} onChange={e => setCompany(e.target.value)}
                      placeholder="Google"
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                  </div>
                </div>
              )}

              <div className="mb-4">
                <label className="text-xs text-gray-500 mb-1 block">
                  {activeSection === 'Cover Letter' ? 'Job Description' : 'Tell us about your background'}
                </label>
                <textarea value={input} onChange={e => setInput(e.target.value)}
                  placeholder={
                    activeSection === 'Professional Summary'
                      ? 'e.g. 5 years React developer with experience in fintech...'
                      : activeSection === 'Cover Letter'
                        ? 'Paste the job description here...'
                        : `Describe your ${activeSection.toLowerCase()} details...`
                  }
                  rows={5}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-none" />
              </div>

              <button onClick={generate} disabled={loading}
                className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3 rounded-xl font-medium hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? (
                  <><span className="animate-spin">⟳</span> Generating…</>
                ) : (
                  <><span>✨</span> Generate {activeSection}</>
                )}
              </button>
            </div>

            {/* Output */}
            {output && (
              <div className="panel-premium p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-gray-800">Generated Content</span>
                  <div className="flex gap-2">
                    <button onClick={() => navigator.clipboard.writeText(output)}
                      className="text-xs text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition">
                      Copy
                    </button>
                    <button onClick={() => setOutput('')}
                      className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">
                      Clear
                    </button>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {output}
                </div>
                <button className="mt-3 w-full bg-gradient-to-r from-green-500 to-teal-500 text-white py-2 rounded-xl text-sm font-medium hover:opacity-90 transition">
                  ✓ Apply to Resume
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
