require("dotenv").config();
const express = require("express");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;
const host = "0.0.0.0"; // 모든 네트워크 인터페이스에서 접속 허용

// CORS 미들웨어 설정
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept"
  );
  next();
});

// PostgreSQL 연결 설정
const pool = new Pool({
  user: process.env.DB_USER || "mkfpartners",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "mkf",
  password: process.env.DB_PASSWORD || "mkfpartners",
  port: process.env.DB_PORT || 5432,
});

// 데이터베이스 연결 테스트
pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error("데이터베이스 연결 오류:", err);
  } else {
    console.log("데이터베이스 연결 성공:", res.rows[0]);
  }
});

// 정적 파일 제공 설정
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// 기본 경로 처리
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 서버 상태 확인용 엔드포인트
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    ip: req.ip,
    headers: req.headers,
  });
});

// 전체 목록 또는 필터링된 목록 조회
app.get("/api/records", async (req, res) => {
  try {
    console.log("Records request received:", req.query); // 요청 로깅
    const {
      id = null,
      nationality = "전체",
      name = "",
      passport_number = "",

      // visa_type = "전체",
      // loan_pre_priority = "전체",
      // commitStatus = "전체",
      // phone_type = "전체",
      commitDateFrom = null,
      commitDateTo = null,
      commitDate = null,
    } = req.query;
    let query = "SELECT * FROM mkf_master";
    let conditions = [];
    let values = [];
    let paramCount = 1;

    function addCondition(field, value, operator = "=") {
      if (value && value !== "전체") {
        conditions.push(`${field} ${operator} $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    function parseAndValidateDate(dateString) {
      if (!/^\d{6}$/.test(dateString)) return null;

      const year = parseInt("20" + dateString.substring(0, 2));
      const month = dateString.substring(2, 4);
      const day = dateString.substring(4, 6);

      if (isValidDate(year, month, day)) {
        return `${year}-${month}-${day}`;
      }
      return null;
    }

    function isValidDate(year, month, day) {
      const date = new Date(`${year}-${month}-${day}`);
      return (
        date.getFullYear() === parseInt(year) &&
        date.getMonth() + 1 === parseInt(month) &&
        date.getDate() === parseInt(day)
      );
    }

    if (id) {
      addCondition("id", id);
    } else {
      addCondition("nationality", nationality);
      addCondition("passport_name", name);
      addCondition("passport_number", passport_number);

      // addCondition("visa_type", visa_type);
      //addCondition("depositDate", deposit_date);
      // addCondition("loan_pre_priority", Number(loan_pre_priority));
      // addCondition("phone_type", Number(phone_type));
      addCondition("commitDate", commitDate);
    }
    if (nationality && nationality !== "전체") {
      conditions.push(`nationality = $${paramCount}`);
      values.push(nationality);
      paramCount++;
    }

    if (name && name !== "") {
      conditions.push(`passport_name = $${paramCount}`);
      values.push(name);
      paramCount++;
    }

    // if (visa_type && visa_type !== "전체") {
    //   conditions.push(`visa_type = $${paramCount}`);
    //   values.push(visa_type);
    //   paramCount++;
    // }

    // let loanPrePriority = req.query.loan_pre_priority;
    // if (Array.isArray(loanPrePriority)) {
    //   loanPrePriority = loanPrePriority[0];
    // }
    // if (loanPrePriority && loanPrePriority !== "전체") {
    //   conditions.push(`loan_pre_priority = $${paramCount}`);
    //   values.push(Number(loanPrePriority));
    //   paramCount++;
    // }

    // let phoneType = req.query.phone_type;
    // if (Array.isArray(phoneType)) {
    //   phoneType = phoneType[0];
    // }
    // if (phoneType && phoneType !== "전체") {
    //   conditions.push(`phone_type = $${paramCount}`);
    //   values.push(Number(phoneType));
    //   paramCount++;
    // }

    // if (commitStatus && commitStatus !== "전체") {
    //   conditions.push(`commit_status = $${paramCount}`);
    //   values.push(commitStatus);
    //   paramCount++;
    // }

    if (commitDateFrom) {
      const dateStr = parseAndValidateDate(commitDateFrom);
      if (dateStr) {
        conditions.push(`DATE(commit_date) >= $${paramCount}`);
        values.push(dateStr);
        paramCount++;
      }
    }

    if (commitDateTo) {
      const dateStr = parseAndValidateDate(commitDateTo);
      if (dateStr) {
        conditions.push(`DATE(commit_date) <= $${paramCount}`);
        values.push(dateStr);
        paramCount++;
      }
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY ID DESC";
    console.log("Executing query:", query, "with values:", values); // 쿼리 로깅
    const result = await pool.query(query, values);
    console.log(`Found ${result.rows.length} records`); // 결과 로깅
    res.json(result.rows);
  } catch (err) {
    console.error("Error in /api/records:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
});

// 상세 정보 조회
app.get("/api/records/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM check_view WHERE id = $1", [
      id,
    ]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: "데이터를 찾을 수 없습니다." });
      return;
    }

    const record = result.rows[0];

    res.json(record);
  } catch (err) {
    console.error("Error in /api/records/:id:", err);
    res.status(500).json({ error: "서버 오류가 발생했습니다." });
  }
});

// 레코드 수정 API
app.put("/api/records/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // 날짜 필드 정리 및 검증
    [
      "commit_date",
      "sent_date",
      "completion_date",
      "entry_date",
      "deposit_date",
    ].forEach((key) => {
      if (updateData[key]) {
        // 숫자, -, :, space만 남기고 초 뒤의 잘못된 값을 제거
        updateData[key] = updateData[key]
          .replace(/[^0-9-: ]/g, "")
          .split(".")[0];
        // 날짜와 시간 사이에 공백 추가
        if (updateData[key].includes(":") && !updateData[key].includes(" ")) {
          updateData[key] = updateData[key].replace(
            /(\d{4}-\d{2}-\d{2})(\d{2}:\d{2}:\d{2})/,
            "$1 $2"
          );
        }
        // PostgreSQL의 ISO, YMD 형식에 맞게 값 검증
        const isValidDate = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(
          updateData[key]
        );
        if (!isValidDate) {
          console.error(
            `Invalid date format for field ${key}: ${updateData[key]}`
          );
          updateData[key] = null; // 잘못된 값은 null로 설정
        }
      }
    });

    // ID는 수정 불가
    delete updateData.id;

    // visa_type 기본값 설정
    if (!updateData.visa_type) {
      updateData.visa_type = "E8"; // 기본값
    }

    // phone_type 기본값 설정
    if (updateData.phone_type === undefined || updateData.phone_type === null) {
      updateData.phone_type = 0; // 기본값
    }

    // loan_pre_priority 기본값 설정
    if (
      updateData.loan_pre_priority === undefined ||
      updateData.loan_pre_priority === null
    ) {
      updateData.loan_pre_priority = 0; // 기본값
    }

    // loan_pre_priority 값을 숫자로 변환
    if (updateData.loan_pre_priority !== undefined) {
      updateData.loan_pre_priority = Number(updateData.loan_pre_priority);
      console.log("loan_pre_priority = " + updateData.loan_pre_priority);
    }

    // tel_number_cam 및 tel_number_kor 처리
    if (!updateData.tel_number_cam) {
      updateData.tel_number_cam = null; // 값이 없으면 null로 설정
    }
    if (!updateData.tel_number_kor) {
      updateData.tel_number_kor = null; // 값이 없으면 null로 설정
    }

    // 업데이트할 필드와 값 생성
    const setClause = Object.keys(updateData)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(", ");
    const values = Object.values(updateData);

    const query = `
      UPDATE mkf_master 
      SET ${setClause}
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [id, ...values]);

    if (result.rows.length === 0) {
      res.status(404).json({ error: "데이터를 찾을 수 없습니다." });
      return;
    }

    console.log("Record updated for ID:", id);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error in updating record:", err);
    res.status(500).json({ error: err.message || "서버 오류가 발생했습니다." });
  }
});

// SQL 쿼리 실행 API
app.post("/execute-query", async (req, res) => {
  const { queries } = req.body; // 여러 쿼리를 배열로 받음
  const client = await pool.connect(); // 트랜잭션을 위해 클라이언트 연결

  try {
    await client.query("BEGIN"); // 트랜잭션 시작

    for (const query of queries) {
      await client.query(query); // 각 쿼리를 실행
    }

    await client.query("COMMIT"); // 모든 쿼리가 성공하면 커밋
    res.status(200).send(`입력이 완료되었습니다 : ${queries.length}건`);
  } catch (error) {
    await client.query("ROLLBACK"); // 실패 시 롤백
    console.error("Error executing queries:", error);
    res.status(500).send(`입력이 실패하였습니다 : ${queries.length}건`);
  } finally {
    client.release(); // 클라이언트 연결 해제
  }
});

// 서버 시작
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

// 에러 핸들링 미들웨어 추가
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "서버 오류가 발생했습니다." });
});

app.listen(port, host, () => {
  console.log(`서버가 http://${host}:${port} 에서 실행 중입니다.`);
  console.log("환경 설정:", {
    nodeEnv: process.env.NODE_ENV,
    dbHost: process.env.DB_HOST,
    dbName: process.env.DB_NAME,
    dbPort: process.env.DB_PORT,
  });
});
