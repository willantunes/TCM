package model;

import java.sql.Date;

public class FreqAluno {

	private int aluno_id;
	private int disciplina_id;
	private Date freqaluno;
	
	public int getAluno_id() {
		return aluno_id;
	}
	public void setAluno_id(int aluno_id) {
		this.aluno_id = aluno_id;
	}
	public int getDisciplina_id() {
		return disciplina_id;
	}
	public void setDisciplina_id(int disciplina_id) {
		this.disciplina_id = disciplina_id;
	}
	public Date getFreqaluno() {
		return freqaluno;
	}
	public void setFreqaluno(Date freqaluno) {
		this.freqaluno = freqaluno;
	}
}
