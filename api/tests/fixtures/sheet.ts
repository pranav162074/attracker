import * as XLSX from 'xlsx';

const SUBJECT_TITLES = [
  '22CT1111-Data Warehousing and Data Mining',
  '22CT1112-Computer Networks',
  '22IT1104-Object Oriented Analysis and Design',
  '22CT1150-Advanced Data Structures & Algorithms (PROFESSIONAL ELECTIVE-I)',
  '22IT1105-Object Oriented Analysis and Design Lab',
  '22CT1114-Computer Networks Lab',
  '22HM11Z2-Constitution of India',
  '22HE11S1-Professional Communication & Soft Skills Lab (SKILL BASED COURSE)',
  '22IT11P5-Introduction to Cloud Computing (OPEN ELECTIVES-I)',
  '22CE11P3-Disaster Management (OPEN ELECTIVES-I)',
  '22CS11P1-Principles of Software Project Management (OPEN ELECTIVES-I)',
];

type Student = { sno: number; registration: string | number; name: string; numbers: Array<[number, number] | null>; total: [number, number] };

export const STUDENTS: Student[] = [
  {
    sno: 1,
    registration: 324103311001,
    name: 'Made Up Classmate',
    numbers: [[32, 24], [26, 22], [32, 28], [28, 23], [30, 30], [30, 27], [16, 15], [21, 18], [23, 13], null, null],
    total: [246, 208],
  },
  {
    sno: 14,
    registration: 'TEST0000015',
    name: 'Test Student',
    numbers: [[32, 15], [26, 18], [32, 19], [28, 15], [30, 18], [30, 27], [16, 10], [21, 9], [23, 11], null, null],
    total: [246, 150],
  },
  {
    sno: 22,
    registration: '325103311L01',
    name: 'Another Made Up Classmate',
    numbers: [[32, 30], [26, 25], [32, 31], [28, 27], [30, 30], [30, 30], [16, 16], [21, 21], null, [16, 16], null],
    total: [239, 234],
  },
];

const percent = (held: number, attended: number) => Math.floor((attended * 10_000) / held) / 100;

export const attendanceSheet = () => {
  const width = 3 + SUBJECT_TITLES.length * 3 + 3;
  const blank = () => Array.from({ length: width }, () => null as unknown);
  const titleRow = blank();
  titleRow[0] = 'Regulation: R22';
  SUBJECT_TITLES.forEach((title, i) => {
    titleRow[3 + i * 3] = title;
  });
  titleRow[width - 3] = 'Held';
  titleRow[width - 2] = 'Attended';
  titleRow[width - 1] = 'Attendance Percentage';
  const info = ['Program: B.Tech.', 'Branch : IT', 'Academic Year: 2026-27', 'Semester:5 ', ''].map((label) => {
    const row = blank();
    row[0] = label;
    return row;
  });
  const header = blank();
  header[0] = 'S.No.';
  header[1] = 'Registration Number';
  header[2] = 'Name of the Student';
  SUBJECT_TITLES.forEach((_, i) => {
    header[3 + i * 3] = 'H';
    header[4 + i * 3] = 'A';
    header[5 + i * 3] = '%';
  });
  const rows = STUDENTS.map((student) => {
    const row = blank();
    row[0] = student.sno;
    row[1] = student.registration;
    row[2] = student.name;
    student.numbers.forEach((pair, i) => {
      row[3 + i * 3] = pair ? pair[0] : '-';
      row[4 + i * 3] = pair ? pair[1] : '-';
      row[5 + i * 3] = pair ? percent(pair[0], pair[1]) : '-';
    });
    row[width - 3] = student.total[0];
    row[width - 2] = student.total[1];
    row[width - 1] = percent(student.total[0], student.total[1]);
    return row;
  });
  const sheet = XLSX.utils.aoa_to_sheet([titleRow, ...info, header, ...rows]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, 'download (2)');
  return XLSX.write(book, { type: 'buffer', bookType: 'xls' }) as Buffer;
};
