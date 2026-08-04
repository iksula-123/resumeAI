-- Generated from job_role_skills_database.csv — do not edit by hand.
-- Adds white-collar/tech roles not covered by the original TAF dataset.
-- demand_count = 0 (no real hiring-demand signal in this source; skills only).

insert into public.role_profiles (slug, canonical_title, skills, skills_detail, education, selection_process, salary_min, salary_max, industry, sub_sector, category, demand_count, raw_title_count, source) values (
  'full-stack-developer', 'Full Stack Developer', '{"HTML","CSS","JavaScript","React","Node.js","Python","SQL","API Integration","Git","Docker"}', '[{"skill": "HTML", "count": 10}, {"skill": "CSS", "count": 9}, {"skill": "JavaScript", "count": 8}, {"skill": "React", "count": 7}, {"skill": "Node.js", "count": 6}, {"skill": "Python", "count": 5}, {"skill": "SQL", "count": 4}, {"skill": "API Integration", "count": 3}, {"skill": "Git", "count": 2}, {"skill": "Docker", "count": 1}]'::jsonb, null, null, null, null, 'IT/Software', null, null, 0, 1, 'skills_db'
) on conflict (slug) do update set
  canonical_title = excluded.canonical_title, skills = excluded.skills, skills_detail = excluded.skills_detail, industry = excluded.industry, updated_at = now();

insert into public.role_profiles (slug, canonical_title, skills, skills_detail, education, selection_process, salary_min, salary_max, industry, sub_sector, category, demand_count, raw_title_count, source) values (
  'ai-engineer', 'AI Engineer', '{"Machine Learning","Deep Learning","Python","LLM","Prompt Engineering","TensorFlow","PyTorch","MLOps","NLP","Vector Databases"}', '[{"skill": "Machine Learning", "count": 10}, {"skill": "Deep Learning", "count": 9}, {"skill": "Python", "count": 8}, {"skill": "LLM", "count": 7}, {"skill": "Prompt Engineering", "count": 6}, {"skill": "TensorFlow", "count": 5}, {"skill": "PyTorch", "count": 4}, {"skill": "MLOps", "count": 3}, {"skill": "NLP", "count": 2}, {"skill": "Vector Databases", "count": 1}]'::jsonb, null, null, null, null, 'IT/Software', null, null, 0, 1, 'skills_db'
) on conflict (slug) do update set
  canonical_title = excluded.canonical_title, skills = excluded.skills, skills_detail = excluded.skills_detail, industry = excluded.industry, updated_at = now();

insert into public.role_profiles (slug, canonical_title, skills, skills_detail, education, selection_process, salary_min, salary_max, industry, sub_sector, category, demand_count, raw_title_count, source) values (
  'ml-engineer', 'ML Engineer', '{"Python","Machine Learning","Feature Engineering","Model Deployment","MLOps","TensorFlow","PyTorch","Statistics","SQL","Cloud AI"}', '[{"skill": "Python", "count": 10}, {"skill": "Machine Learning", "count": 9}, {"skill": "Feature Engineering", "count": 8}, {"skill": "Model Deployment", "count": 7}, {"skill": "MLOps", "count": 6}, {"skill": "TensorFlow", "count": 5}, {"skill": "PyTorch", "count": 4}, {"skill": "Statistics", "count": 3}, {"skill": "SQL", "count": 2}, {"skill": "Cloud AI", "count": 1}]'::jsonb, null, null, null, null, 'IT/Software', null, null, 0, 1, 'skills_db'
) on conflict (slug) do update set
  canonical_title = excluded.canonical_title, skills = excluded.skills, skills_detail = excluded.skills_detail, industry = excluded.industry, updated_at = now();

insert into public.role_profiles (slug, canonical_title, skills, skills_detail, education, selection_process, salary_min, salary_max, industry, sub_sector, category, demand_count, raw_title_count, source) values (
  'data-scientist', 'Data Scientist', '{"Python","R","Statistics","Machine Learning","Data Visualization","SQL","Pandas","NumPy","Tableau","Power BI"}', '[{"skill": "Python", "count": 10}, {"skill": "R", "count": 9}, {"skill": "Statistics", "count": 8}, {"skill": "Machine Learning", "count": 7}, {"skill": "Data Visualization", "count": 6}, {"skill": "SQL", "count": 5}, {"skill": "Pandas", "count": 4}, {"skill": "NumPy", "count": 3}, {"skill": "Tableau", "count": 2}, {"skill": "Power BI", "count": 1}]'::jsonb, null, null, null, null, 'IT/Software', null, null, 0, 1, 'skills_db'
) on conflict (slug) do update set
  canonical_title = excluded.canonical_title, skills = excluded.skills, skills_detail = excluded.skills_detail, industry = excluded.industry, updated_at = now();

insert into public.role_profiles (slug, canonical_title, skills, skills_detail, education, selection_process, salary_min, salary_max, industry, sub_sector, category, demand_count, raw_title_count, source) values (
  'project-manager', 'Project Manager', '{"Project Planning","Risk Management","Agile","Scrum","Stakeholder Management","Budgeting","Leadership","Communication"}', '[{"skill": "Project Planning", "count": 8}, {"skill": "Risk Management", "count": 7}, {"skill": "Agile", "count": 6}, {"skill": "Scrum", "count": 5}, {"skill": "Stakeholder Management", "count": 4}, {"skill": "Budgeting", "count": 3}, {"skill": "Leadership", "count": 2}, {"skill": "Communication", "count": 1}]'::jsonb, null, null, null, null, 'IT/Software', null, null, 0, 1, 'skills_db'
) on conflict (slug) do update set
  canonical_title = excluded.canonical_title, skills = excluded.skills, skills_detail = excluded.skills_detail, industry = excluded.industry, updated_at = now();

insert into public.role_profiles (slug, canonical_title, skills, skills_detail, education, selection_process, salary_min, salary_max, industry, sub_sector, category, demand_count, raw_title_count, source) values (
  'business-analyst', 'Business Analyst', '{"Requirements Gathering","BRD","FRD","SQL","Agile","Process Mapping","UAT","Documentation"}', '[{"skill": "Requirements Gathering", "count": 8}, {"skill": "BRD", "count": 7}, {"skill": "FRD", "count": 6}, {"skill": "SQL", "count": 5}, {"skill": "Agile", "count": 4}, {"skill": "Process Mapping", "count": 3}, {"skill": "UAT", "count": 2}, {"skill": "Documentation", "count": 1}]'::jsonb, null, null, null, null, 'IT/Software', null, null, 0, 1, 'skills_db'
) on conflict (slug) do update set
  canonical_title = excluded.canonical_title, skills = excluded.skills, skills_detail = excluded.skills_detail, industry = excluded.industry, updated_at = now();

insert into public.role_profiles (slug, canonical_title, skills, skills_detail, education, selection_process, salary_min, salary_max, industry, sub_sector, category, demand_count, raw_title_count, source) values (
  'devops-engineer', 'DevOps Engineer', '{"Docker","Kubernetes","Jenkins","Terraform","Linux","AWS","CI/CD","Monitoring","Ansible","Git"}', '[{"skill": "Docker", "count": 10}, {"skill": "Kubernetes", "count": 9}, {"skill": "Jenkins", "count": 8}, {"skill": "Terraform", "count": 7}, {"skill": "Linux", "count": 6}, {"skill": "AWS", "count": 5}, {"skill": "CI/CD", "count": 4}, {"skill": "Monitoring", "count": 3}, {"skill": "Ansible", "count": 2}, {"skill": "Git", "count": 1}]'::jsonb, null, null, null, null, 'IT/Software', null, null, 0, 1, 'skills_db'
) on conflict (slug) do update set
  canonical_title = excluded.canonical_title, skills = excluded.skills, skills_detail = excluded.skills_detail, industry = excluded.industry, updated_at = now();

insert into public.role_profiles (slug, canonical_title, skills, skills_detail, education, selection_process, salary_min, salary_max, industry, sub_sector, category, demand_count, raw_title_count, source) values (
  'cloud-engineer', 'Cloud Engineer', '{"AWS","Azure","Google Cloud","Networking","Terraform","Linux","Security","Containers"}', '[{"skill": "AWS", "count": 8}, {"skill": "Azure", "count": 7}, {"skill": "Google Cloud", "count": 6}, {"skill": "Networking", "count": 5}, {"skill": "Terraform", "count": 4}, {"skill": "Linux", "count": 3}, {"skill": "Security", "count": 2}, {"skill": "Containers", "count": 1}]'::jsonb, null, null, null, null, 'IT/Software', null, null, 0, 1, 'skills_db'
) on conflict (slug) do update set
  canonical_title = excluded.canonical_title, skills = excluded.skills, skills_detail = excluded.skills_detail, industry = excluded.industry, updated_at = now();

insert into public.role_profiles (slug, canonical_title, skills, skills_detail, education, selection_process, salary_min, salary_max, industry, sub_sector, category, demand_count, raw_title_count, source) values (
  'cyber-security-analyst', 'Cyber Security Analyst', '{"Network Security","SIEM","SOC","Incident Response","Penetration Testing","Risk Assessment","Security Monitoring"}', '[{"skill": "Network Security", "count": 7}, {"skill": "SIEM", "count": 6}, {"skill": "SOC", "count": 5}, {"skill": "Incident Response", "count": 4}, {"skill": "Penetration Testing", "count": 3}, {"skill": "Risk Assessment", "count": 2}, {"skill": "Security Monitoring", "count": 1}]'::jsonb, null, null, null, null, 'IT/Software', null, null, 0, 1, 'skills_db'
) on conflict (slug) do update set
  canonical_title = excluded.canonical_title, skills = excluded.skills, skills_detail = excluded.skills_detail, industry = excluded.industry, updated_at = now();

insert into public.role_profiles (slug, canonical_title, skills, skills_detail, education, selection_process, salary_min, salary_max, industry, sub_sector, category, demand_count, raw_title_count, source) values (
  'qa-engineer', 'QA Engineer', '{"Manual Testing","Automation Testing","Selenium","API Testing","Performance Testing","Test Cases","Bug Tracking"}', '[{"skill": "Manual Testing", "count": 7}, {"skill": "Automation Testing", "count": 6}, {"skill": "Selenium", "count": 5}, {"skill": "API Testing", "count": 4}, {"skill": "Performance Testing", "count": 3}, {"skill": "Test Cases", "count": 2}, {"skill": "Bug Tracking", "count": 1}]'::jsonb, null, null, null, null, 'IT/Software', null, null, 0, 1, 'skills_db'
) on conflict (slug) do update set
  canonical_title = excluded.canonical_title, skills = excluded.skills, skills_detail = excluded.skills_detail, industry = excluded.industry, updated_at = now();

insert into public.role_profiles (slug, canonical_title, skills, skills_detail, education, selection_process, salary_min, salary_max, industry, sub_sector, category, demand_count, raw_title_count, source) values (
  'banking-professional', 'Banking Professional', '{"Retail Banking","Credit Analysis","KYC","AML","Customer Service","Risk Management","Financial Products"}', '[{"skill": "Retail Banking", "count": 7}, {"skill": "Credit Analysis", "count": 6}, {"skill": "KYC", "count": 5}, {"skill": "AML", "count": 4}, {"skill": "Customer Service", "count": 3}, {"skill": "Risk Management", "count": 2}, {"skill": "Financial Products", "count": 1}]'::jsonb, null, null, null, null, 'BFSI', null, null, 0, 1, 'skills_db'
) on conflict (slug) do update set
  canonical_title = excluded.canonical_title, skills = excluded.skills, skills_detail = excluded.skills_detail, industry = excluded.industry, updated_at = now();

insert into public.role_profiles (slug, canonical_title, skills, skills_detail, education, selection_process, salary_min, salary_max, industry, sub_sector, category, demand_count, raw_title_count, source) values (
  'finance-analyst', 'Finance Analyst', '{"Financial Modeling","Excel","Budgeting","Forecasting","Accounting","Valuation","Power BI"}', '[{"skill": "Financial Modeling", "count": 7}, {"skill": "Excel", "count": 6}, {"skill": "Budgeting", "count": 5}, {"skill": "Forecasting", "count": 4}, {"skill": "Accounting", "count": 3}, {"skill": "Valuation", "count": 2}, {"skill": "Power BI", "count": 1}]'::jsonb, null, null, null, null, 'BFSI', null, null, 0, 1, 'skills_db'
) on conflict (slug) do update set
  canonical_title = excluded.canonical_title, skills = excluded.skills, skills_detail = excluded.skills_detail, industry = excluded.industry, updated_at = now();

insert into public.role_profiles (slug, canonical_title, skills, skills_detail, education, selection_process, salary_min, salary_max, industry, sub_sector, category, demand_count, raw_title_count, source) values (
  'digital-marketing-executive', 'Digital Marketing Executive', '{"SEO","Google Ads","Google Analytics","Content Marketing","Email Marketing","Social Media Marketing"}', '[{"skill": "SEO", "count": 6}, {"skill": "Google Ads", "count": 5}, {"skill": "Google Analytics", "count": 4}, {"skill": "Content Marketing", "count": 3}, {"skill": "Email Marketing", "count": 2}, {"skill": "Social Media Marketing", "count": 1}]'::jsonb, null, null, null, null, 'Marketing', null, null, 0, 1, 'skills_db'
) on conflict (slug) do update set
  canonical_title = excluded.canonical_title, skills = excluded.skills, skills_detail = excluded.skills_detail, industry = excluded.industry, updated_at = now();

insert into public.role_profiles (slug, canonical_title, skills, skills_detail, education, selection_process, salary_min, salary_max, industry, sub_sector, category, demand_count, raw_title_count, source) values (
  'network-engineer', 'Network Engineer', '{"CCNA","Routing","Switching","TCP/IP","Firewall","Network Monitoring","Troubleshooting"}', '[{"skill": "CCNA", "count": 7}, {"skill": "Routing", "count": 6}, {"skill": "Switching", "count": 5}, {"skill": "TCP/IP", "count": 4}, {"skill": "Firewall", "count": 3}, {"skill": "Network Monitoring", "count": 2}, {"skill": "Troubleshooting", "count": 1}]'::jsonb, null, null, null, null, 'IT/Software', null, null, 0, 1, 'skills_db'
) on conflict (slug) do update set
  canonical_title = excluded.canonical_title, skills = excluded.skills, skills_detail = excluded.skills_detail, industry = excluded.industry, updated_at = now();

insert into public.role_profiles (slug, canonical_title, skills, skills_detail, education, selection_process, salary_min, salary_max, industry, sub_sector, category, demand_count, raw_title_count, source) values (
  'erp-consultant', 'ERP Consultant', '{"SAP","Oracle ERP","Business Processes","Configuration","Training","Documentation","Testing"}', '[{"skill": "SAP", "count": 7}, {"skill": "Oracle ERP", "count": 6}, {"skill": "Business Processes", "count": 5}, {"skill": "Configuration", "count": 4}, {"skill": "Training", "count": 3}, {"skill": "Documentation", "count": 2}, {"skill": "Testing", "count": 1}]'::jsonb, null, null, null, null, 'IT/Software', null, null, 0, 1, 'skills_db'
) on conflict (slug) do update set
  canonical_title = excluded.canonical_title, skills = excluded.skills, skills_detail = excluded.skills_detail, industry = excluded.industry, updated_at = now();

