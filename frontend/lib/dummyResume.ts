export const DUMMY_RESUME = {
  personalInfo: {
    fullName: 'John Doe',
    jobTitle: 'Senior React Developer',
    email: 'john.doe@email.com',
    phone: '+1 (555) 123-4567',
    location: 'San Francisco, CA',
    linkedin: 'linkedin.com/in/johndoe',
    github: 'github.com/johndoe',
    website: 'johndoe.dev',
  },
  summary:
    'Senior React Developer with 9+ years of experience building scalable, high-performance web applications. Expertise in React, Next.js, TypeScript, and modern front-end technologies. Passionate about clean code, UI/UX, and delivering exceptional user experiences.',
  experience: [
    {
      id: '1',
      position: 'Senior React Developer',
      company: 'TechSolutions Inc.',
      location: 'San Francisco, CA',
      startDate: 'Jan 2021',
      endDate: '',
      current: true,
      bullets: [
        'Developed and maintained scalable React applications using Next.js and TypeScript',
        'Improved application performance by 40% through code splitting and lazy loading',
        'Collaborated with product teams to build reusable UI components and design systems',
        'Integrated RESTful APIs and optimized front-end architecture',
      ],
    },
    {
      id: '2',
      position: 'React Developer',
      company: 'InnovateX Labs',
      location: 'Austin, TX',
      startDate: 'Jun 2018',
      endDate: 'Dec 2020',
      current: false,
      bullets: [
        'Built responsive and interactive user interfaces using React.js and Redux',
        'Reduced bugs by 30% by writing unit tests using Jest and React Testing Library',
        'Implemented CI/CD pipelines using GitHub Actions',
      ],
    },
    {
      id: '3',
      position: 'Frontend Developer',
      company: 'WebCraft Solutions',
      location: 'Ahmedabad, India',
      startDate: 'Mar 2016',
      endDate: 'May 2018',
      current: false,
      bullets: [
        'Developed user interfaces using HTML, CSS, JavaScript, and jQuery',
        'Converted mockups into pixel-perfect, responsive web pages',
        'Worked closely with designers and backend developers',
      ],
    },
  ],
  education: [
    {
      id: '1',
      degree: 'Bachelor of Engineering',
      field: 'Computer Science',
      institution: 'Gujarat Technological University',
      location: 'Ahmedabad, India',
      startDate: '2012',
      endDate: '2016',
      gpa: '3.8',
    },
  ],
  skills: [
    { name: 'React.js', level: 95 },
    { name: 'Next.js', level: 90 },
    { name: 'TypeScript', level: 88 },
    { name: 'JavaScript (ES6+)', level: 95 },
    { name: 'Redux Toolkit', level: 82 },
    { name: 'Tailwind CSS', level: 85 },
    { name: 'Node.js', level: 75 },
    { name: 'Git & GitHub', level: 90 },
    { name: 'REST APIs', level: 88 },
  ],
  projects: [
    {
      id: '1',
      name: 'E-Commerce Platform',
      technologies: 'Next.js, React, TypeScript, Stripe, Tailwind CSS',
      description:
        'A full-featured e-commerce platform with authentication, payment integration, and admin dashboard.',
    },
    {
      id: '2',
      name: 'Task Management App',
      technologies: 'React, Redux Toolkit, Node.js, MongoDB',
      description:
        'A collaborative task management application with real-time updates and notifications.',
    },
  ],
  certifications: [
    { id: '1', name: 'AWS Certified Developer', issuer: 'Amazon Web Services', date: '2023' },
    { id: '2', name: 'Meta React Developer', issuer: 'Meta', date: '2022' },
  ],
  achievements: [
    'Led team of 8 engineers to deliver a platform serving 500K+ daily active users',
    'Speaker at ReactConf 2022 on performance optimization patterns',
    'Open source contributor with 2.1k GitHub stars across projects',
  ],
  languages: [
    { name: 'English', proficiency: 'Native' },
    { name: 'Hindi', proficiency: 'Native' },
    { name: 'Gujarati', proficiency: 'Fluent' },
  ],
  interests: ['Open Source', 'Tech Blogging', 'UI/UX Design', 'Chess'],
}
