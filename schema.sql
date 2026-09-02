DROP TABLE IF EXISTS comments CASCADE;
DROP TABLE IF EXISTS cheatsheets CASCADE;
DROP TABLE IF EXISTS files CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS stripe CASCADE;

CREATE TABLE users (
    user_id VARCHAR(128) PRIMARY KEY,      -- Firebase UID
    user_name VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,

    program VARCHAR(20),
    year_of_study INT CHECK (year_of_study BETWEEN 1 AND 10),

    subscription_status VARCHAR(50) DEFAULT 'inactive',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    portrait_url text,
    recent_file_ids INTEGER[] DEFAULT '{}' 
);


CREATE TABLE files (
    file_id SERIAL PRIMARY KEY,

    user_id VARCHAR(128) NOT NULL,

    title VARCHAR(200) NOT NULL,
    description TEXT,

    course_dept VARCHAR(10),
    course_num VARCHAR(10),
    course_name VARCHAR(100),

    content_type VARCHAR(50),

    file_name VARCHAR(255),
    file_type VARCHAR(100),
    file_url TEXT NOT NULL,

    ai_tags TEXT[],
    ai_preview TEXT,
    ai_summary TEXT,
    ai_practice JSONB,

    -- pending | ready | failed
    ai_upload_status VARCHAR(20) DEFAULT 'pending',
    -- NULL | pending | ready | failed (NULL until mark-solved)
    ai_solve_status VARCHAR(20),

    solved BOOLEAN DEFAULT FALSE,

    rating_positive INT DEFAULT 0 CHECK (rating_positive >= 0),
    rating_negative INT DEFAULT 0 CHECK (rating_negative >= 0),

    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT fk_file_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);


CREATE TABLE comments (
    comment_id SERIAL PRIMARY KEY,

    file_id INT,
    question_id INT,

    user_id VARCHAR(128) NOT NULL,

    content TEXT NOT NULL,

    rating_positive INT DEFAULT 0 CHECK (rating_positive >= 0),
    rating_negative INT DEFAULT 0 CHECK (rating_negative >= 0),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_comment_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    CONSTRAINT fk_comment_file
        FOREIGN KEY (file_id)
        REFERENCES files(file_id)
        ON DELETE CASCADE
);

-- One AI cheat sheet per course (aggregated from that course's notes).
CREATE TABLE cheatsheets (
    cheatsheet_id SERIAL PRIMARY KEY,

    course_dept VARCHAR(10) NOT NULL,
    course_num VARCHAR(10) NOT NULL,
    course_name VARCHAR(100),

    content JSONB,

    -- NULL | pending | ready | failed
    ai_status VARCHAR(20),

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT uq_cheatsheet_course UNIQUE (course_dept, course_num)
);

create table stripe (
    user_id VARCHAR(128) PRIMARY KEY,
    stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
    subscription_status VARCHAR(50) DEFAULT 'inactive',
    subscription_at_latest TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- When the subscription was created or last updated

    CONSTRAINT fk_stripe_user
        FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);