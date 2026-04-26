/**
 * Generate remaining filler candidates to reach 120 total.
 * Uses deterministic data — no LLM calls needed.
 *
 * Usage: node scripts/generate-filler-pool.mjs
 */

import { readFileSync, writeFileSync } from 'fs';

const existingPool = JSON.parse(readFileSync('data/pool.json', 'utf8'));
const existingHidden = JSON.parse(readFileSync('data/hidden-states.json', 'utf8'));

const TARGET = 120;
const needed = TARGET - existingPool.length;
console.log(`Pool has ${existingPool.length} profiles, generating ${needed} more...`);

// Deterministic seed
let seed = 42;
function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }

const FIRST_NAMES = ['Aisha','Ben','Carmen','David','Elena','Faris','Grace','Hiroshi','Isha','Jamal','Kira','Liam','Mei','Nathan','Olivia','Priya','Quinn','Ravi','Sara','Tomas','Uma','Vikram','Wendy','Xander','Yuki','Zara','Adrian','Bianca','Carlos','Diana','Ethan','Fatima','George','Hannah','Ivan','Julia','Kevin','Luna','Marco','Nina','Omar','Paula','Rafael','Sonia','Tyler','Ursula','Vera','Wesley','Ximena','Yasmin','Zoe','Aiden','Briana','Cyrus','Desiree','Emilio','Freya','Gideon','Hana','Iris','Javier','Kayla','Leo','Mira','Niko','Ophelia','Pedro','Rosa','Samir','Thea','Uri','Valeria','Warren','Xiomara','Yosef','Zeke','Amara','Blake','Cassidy','Dmitri','Elise','Felix','Greta','Hugo','Isla','Jonas','Kenji','Leila','Max','Nadia','Oscar','Petra','Rowan','Selena','Theo','Usha','Vincent','Willa','Yara','Zion'];
const LAST_NAMES = ['Patel','Chen','Rodriguez','Kim','Johnson','Okafor','Singh','Williams','Brown','Martinez','Lee','Anderson','Garcia','Nakamura','Gupta','Taylor','Thomas','Moore','Wilson','Jackson','White','Lopez','Harris','Clark','Lewis','Scott','Adams','Baker','Carter','Mitchell','Perez','Roberts','Phillips','Campbell','Evans','Turner','Parker','Collins','Edwards','Stewart','Reed','Gray','Diaz','Hayes','Myers','Ross','Bell','Ward','Cox','Rivera','Cooper','Morgan','Howard','Flores','Morris','Murphy','Cook','Bailey','Brooks','Kelly','Bennett','Price','Wood','Barnes','Fisher','Porter','Gibson','Marshall','Grant','Fox','Berry','Greene','Hunt','Mason','Stone','Dixon','Hicks','Burke','Fleming','Dunn','Soto','Mendez','Vega','Reyes','Salazar','Herrera','Vargas','Ramos','Delgado','Morales','Jimenez','Ortega','Dominguez','Aguilar','Castillo','Torres','Rios','Serrano','Figueroa','Medina','Molina','Guerrero','Cruz'];
const TITLES = ['Software Engineer','Senior Software Engineer','Staff Engineer','ML Engineer','Data Scientist','Platform Engineer','DevOps Engineer','Backend Engineer','Frontend Engineer','Full Stack Developer','Infrastructure Engineer','Cloud Architect','Solutions Architect','Engineering Manager','Tech Lead','Product Engineer','Research Engineer','Applied Scientist','Data Engineer','Site Reliability Engineer','Security Engineer','Mobile Developer','QA Engineer','Embedded Systems Engineer','Systems Programmer'];
const COMPANIES = ['Google','Meta','Amazon','Microsoft','Apple','Netflix','Stripe','Airbnb','Uber','Lyft','Databricks','Snowflake','Palantir','Figma','Vercel','Supabase','Cloudflare','Datadog','HashiCorp','Confluent','MongoDB','Elastic','Twilio','Plaid','Brex','Notion','Linear','Retool','Airtable','Amplitude','Segment','Mixpanel','LaunchDarkly','PlanetScale','Neon','Fly.io','Railway','Render','DigitalOcean','Heroku','Scale AI','Anthropic','OpenAI','Cohere','Hugging Face','Mistral','DeepMind','xAI','Inflection','Adept','Character AI','Stability AI','Runway','Jasper','Writer','Copy.ai','Grammarly','Canva','Miro','Slack','Discord','Zoom','Atlassian','GitLab','GitHub','JetBrains','Postman','Insomnia','Sentry','New Relic','Grafana','Prometheus','Temporal','Dagster','Prefect','Weights & Biases','MLflow','DVC','LangChain','LlamaIndex','AutoGPT','CrewAI','Pydantic','FastAPI','Prisma','Drizzle','tRPC','Bun','Deno','Turso','CockroachDB','TiDB','Yugabyte','MindsDB','Pinecone','Weaviate','Qdrant','Chroma','Milvus'];
const LOCATIONS = ['San Francisco, CA','New York, NY','Seattle, WA','Austin, TX','Chicago, IL','Boston, MA','Denver, CO','Portland, OR','Los Angeles, CA','Miami, FL','Bengaluru, India','London, UK','Berlin, Germany','Toronto, Canada','Singapore','Sydney, Australia','Tel Aviv, Israel','Amsterdam, Netherlands','Dublin, Ireland','Remote'];
const SKILLS = ['Python','JavaScript','TypeScript','Go','Rust','Java','C++','Kotlin','Swift','Ruby','Scala','Elixir','React','Next.js','Vue.js','Angular','Svelte','Node.js','Django','Flask','FastAPI','Spring Boot','Rails','Express.js','PostgreSQL','MySQL','MongoDB','Redis','Elasticsearch','Kafka','RabbitMQ','gRPC','GraphQL','REST','Docker','Kubernetes','Terraform','AWS','GCP','Azure','CI/CD','Git','Linux','Microservices','Distributed Systems','Machine Learning','Deep Learning','NLP','Computer Vision','LLMs','RAG','Agent Frameworks','Prompt Engineering','Fine-tuning','MLOps','Data Pipelines','Spark','Airflow','dbt','Snowflake','BigQuery','Redshift','TensorFlow','PyTorch','JAX','scikit-learn','pandas','NumPy','Langchain','LlamaIndex'];
const SCHOOLS = ['MIT','Stanford','Carnegie Mellon','UC Berkeley','Georgia Tech','University of Washington','University of Michigan','Cornell','Princeton','Columbia','IIT Bombay','IIT Delhi','IISc Bangalore','University of Toronto','ETH Zurich','Oxford','Cambridge','Imperial College','NUS Singapore','Tsinghua University','Peking University','Seoul National University','University of Tokyo','Technical University of Munich'];
const DEGREES = ['BS Computer Science','MS Computer Science','BS Electrical Engineering','MS Machine Learning','BS Mathematics','MS Data Science','PhD Computer Science','BS Software Engineering','MS Artificial Intelligence','BE Information Technology','BTech Computer Science','MTech AI/ML'];

const DRIVERS = ['compensation','mission','growth','team','autonomy','stability'];
const SEARCH_INTENSITIES = ['passive_curiosity','passive_curiosity','passive_curiosity','casually_looking','casually_looking','casually_looking','casually_looking','actively_interviewing','actively_interviewing','has_offers'];
const VERBOSITIES = ['terse','medium','medium','medium','verbose'];
const DIRECTNESSES = ['very_direct','diplomatic','diplomatic','diplomatic','evasive'];

for (let i = 0; i < needed; i++) {
  const idx = existingPool.length + i;
  const isFiller = idx >= 30; // first 30 are strong, rest are filler
  const id = isFiller ? `filler_${String(idx - 29).padStart(2, '0')}` : `strong_${String(idx - 4).padStart(2, '0')}`;

  const firstName = pick(FIRST_NAMES);
  const lastName = pick(LAST_NAMES);
  const yrsExp = isFiller ? randInt(1, 12) : randInt(4, 15);
  const numJobs = Math.min(randInt(2, 5), Math.ceil(yrsExp / 2));
  const workHistory = [];
  let remainingYrs = yrsExp;
  for (let j = 0; j < numJobs && remainingYrs > 0; j++) {
    const yrs = j === numJobs - 1 ? remainingYrs : randInt(1, Math.min(4, remainingYrs));
    workHistory.push({
      role: pick(TITLES),
      company: pick(COMPANIES),
      years: yrs,
      start_year: 2026 - remainingYrs,
      end_year: j === 0 ? undefined : 2026 - remainingYrs + yrs,
      highlights: [
        `${pick(['Led','Built','Shipped','Designed','Optimized','Scaled'])} ${pick(['a','the'])} ${pick(['data pipeline','ML model','API platform','microservice','frontend app','monitoring system','search engine','recommendation system'])}`,
        `${pick(['Reduced','Improved','Increased'])} ${pick(['latency','throughput','reliability','test coverage','deployment frequency'])} by ${randInt(15, 80)}%`,
      ],
    });
    remainingYrs -= yrs;
  }

  const numSkills = isFiller ? randInt(4, 8) : randInt(6, 12);
  const skills = [];
  const used = new Set();
  for (let j = 0; j < numSkills; j++) {
    let s = pick(SKILLS);
    while (used.has(s)) s = pick(SKILLS);
    used.add(s);
    skills.push(s);
  }

  const profile = {
    id,
    name: `${firstName} ${lastName}`,
    current_title: workHistory[0]?.role || pick(TITLES),
    current_company: workHistory[0]?.company || pick(COMPANIES),
    years_experience: yrsExp,
    location: pick(LOCATIONS),
    work_history: workHistory,
    skills_declared: skills,
    skills_demonstrated: skills.slice(0, 3).map(s => ({
      skill: s,
      evidence_refs: [`Used ${s} in production at ${pick(COMPANIES)}`],
    })),
    education: [{
      degree: pick(DEGREES),
      institution: pick(SCHOOLS),
      year: 2026 - yrsExp - randInt(0, 2),
    }],
    recent_signals: rand() > 0.5 ? [{
      type: pick(['tweet', 'blog_post', 'github_activity']),
      content: `${pick(['Exploring','Writing about','Building with','Benchmarking'])} ${pick(['LLM agents','RAG pipelines','fine-tuning','vector databases','prompt engineering'])}`,
      date: `2026-0${randInt(1, 4)}-${String(randInt(1, 28)).padStart(2, '0')}`,
    }] : [],
    stated_preferences: rand() > 0.6 ? {
      remote_preference: pick(['remote', 'hybrid', 'onsite', 'flexible']),
      comp_range: `$${randInt(120, 350)}K–$${randInt(200, 500)}K`,
    } : undefined,
  };

  const hidden = {
    situation: {
      current_role_satisfaction: randInt(3, 9),
      search_intensity: pick(SEARCH_INTENSITIES),
      time_at_current_role_months: randInt(4, 48),
      real_reason_for_move: pick([
        'Bored with current work, want more technical challenge',
        'Company is struggling financially, looking for stability',
        'Want to transition into AI/ML from adjacent field',
        'Passed over for promotion, frustrated',
        'Team culture has degraded after leadership changes',
        'Spouse relocating, need remote-friendly role',
        'Curious about startups after years at big tech',
        'Want more ownership and autonomy',
        'Current role is too narrow, want broader scope',
        'Compensation below market, exploring options',
        'Happy but always keeping ears open',
        'Just exploring, no real urgency',
        'Want to work on more impactful problems',
        'Burned out, looking for better work-life balance',
      ]),
    },
    drivers: {
      primary: pick(DRIVERS),
      secondary: pick(DRIVERS),
      compensation_expectation: {
        min: randInt(150, 300) * 1000,
        target: randInt(200, 400) * 1000,
        attitude: pick(['flexible', 'firm', 'negotiable', 'open to equity-heavy']),
      },
      deal_breakers: [pick([
        'Must be remote', 'No return-to-office mandates', 'Need visa sponsorship',
        'Won\'t manage people', 'Need equity upside', 'No on-call rotations',
        'Must use modern tech stack', 'Need clear growth path',
      ])],
    },
    concerns: {
      about_this_role: [{
        concern: pick([
          'Unclear career progression', 'Small team might mean too many hats',
          'AI hype cycle — will this company survive?', 'Role seems too junior',
          'Not sure about the tech stack', 'Worried about work-life balance',
        ]),
        severity: pick(['low', 'medium', 'high']),
      }],
      about_the_company: [pick([
        'Never heard of them', 'Small company risk', 'Funding unclear',
        'Not sure about the market', 'Culture unknown',
      ])],
      gut_feel: pick([
        'Cautiously optimistic', 'Skeptical but curious', 'Mildly interested',
        'Not really excited', 'Intrigued by the problem space', 'Would need convincing',
      ]),
    },
    life: {
      constraints: pick(['None significant', 'Young kids, need flexibility', 'Visa situation', 'Partner\'s career limits relocation', 'Health considerations']),
      external_pressures: pick(['None', 'Financial pressure', 'Family expectations', 'Lease ending soon', 'Current company restructuring']),
      risk_appetite: pick(['high', 'medium', 'medium', 'low']),
    },
    behavior: {
      verbosity: pick(VERBOSITIES),
      politeness_mask: randInt(4, 9),
      directness: pick(DIRECTNESSES),
      question_tendency: pick(['rarely', 'normal', 'normal', 'probing']),
    },
    revelation: {
      volunteer: [pick(['Recent projects', 'Skills and interests', 'General career goals', 'Public work and writing'])],
      respond: [pick(['Current role satisfaction', 'General interest level', 'Team dynamics', 'What excites them'])],
      guarded: [pick(['Specific comp expectations', 'Real reason for leaving', 'Other offers', 'Personal life constraints', 'Deep concerns about the role'])],
    },
  };

  existingPool.push(profile);
  existingHidden[id] = hidden;
}

writeFileSync('data/pool.json', JSON.stringify(existingPool, null, 2));
writeFileSync('data/hidden-states.json', JSON.stringify(existingHidden, null, 2));
console.log(`✓ Pool now has ${existingPool.length} profiles, hidden-states has ${Object.keys(existingHidden).length} entries.`);
