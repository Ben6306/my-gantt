// 태스크 색상 팔레트(키와 화면에 보일 영어 이름). 실제 색 값은 style.css의 .c-<키> 클래스에 있다.
export const TASK_COLORS = [
  { key: 'purple', name: 'Purple' },
  { key: 'blue', name: 'Blue' },
  { key: 'sky', name: 'Sky' },
  { key: 'teal', name: 'Teal' },
  { key: 'green', name: 'Green' },
  { key: 'yellow', name: 'Yellow' },
  { key: 'orange', name: 'Orange' },
  { key: 'red', name: 'Red' },
  { key: 'pink', name: 'Pink' },
  { key: 'gray', name: 'Gray' },
];

const KEYS = new Set(TASK_COLORS.map((c) => c.key));

export const isColorKey = (value) => KEYS.has(value);

// 색이 없는 태스크에 순서대로 돌아가며 색을 준다
export const colorFor = (index) => TASK_COLORS[index % TASK_COLORS.length].key;
