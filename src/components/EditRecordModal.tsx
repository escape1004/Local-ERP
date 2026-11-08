import React, { useState, useEffect } from 'react';
import { Category, DataRecord } from '../types';
import { useERPStore } from '../hooks/useERPStore';

interface EditRecordModalProps {
  category: Category;
  record: DataRecord;
  onClose: () => void;
}

const EditRecordModal: React.FC<EditRecordModalProps> = ({
  category,
  record,
  onClose,
}) => {
  const { updateRecord } = useERPStore();
  const [formData, setFormData] = useState<Record<string, unknown>>(JSON.parse(JSON.stringify(record.data)));
  const [error, setError] = useState<string>('');

  // ESC 키로 모달 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      // 필수 필드 검사
      const requiredFields = category.fields.filter(field => field.required);
      for (const field of requiredFields) {
        if (!formData[field.id] && formData[field.id] !== 0) {
          setError(`${field.name} 필드는 필수입니다.`);
          return;
        }
      }

      await updateRecord(record.id, formData);
      onClose();
    } catch (error) {
      console.error('Error updating record:', error);
      setError(error instanceof Error ? error.message : '레코드 수정 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-discord-bg rounded-xl w-full max-w-2xl overflow-hidden">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-discord-text">
            레코드 수정
          </h2>
          <p className="text-discord-muted text-sm mt-1">
            {category.name}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {category.fields
            .filter(f => !f.hidden)
            .sort((a, b) => a.order - b.order)
            .map(field => (
              <div key={field.id} className="space-y-2">
                <label className="text-sm font-medium text-discord-text">
                  {field.name}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                  {field.unique && <span className="text-yellow-500 ml-1">(중복 불가)</span>}
                </label>
                {/* Field input components */}
              </div>
            ))}

          {error && (
            <div className="text-red-500 text-sm mt-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-discord-text bg-discord-dark hover:bg-discord-dark/80 rounded"
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-discord-accent hover:bg-discord-accent/80 rounded"
            >
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditRecordModal; 
